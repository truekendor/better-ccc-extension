/**
 * Live game end detection, part 3 of 4: the detectors.
 *
 * Each one looks at the watched game (a LiveGameSession) and proposes a
 * result (a GameEndCandidate) that the arbiter shows or not, roughly in
 * this order of arrival and trust:
 * - PageSocketDetector (certain): CCC's own `result` message, ~0.2 s after
 *   the last move (needs inject/index.js)
 * - BoardRulesDetector (certain): mate, stalemate, repetition, 50 moves,
 *   insufficient material, as soon as the move is played
 * - TablebaseDetector, EvalDrawDetector (provisional): CCC's adjudication
 *   rules, shown once FreezeDetector confirms the engines stopped
 * - TimeForfeitDetector (provisional): the side to move ran out of time
 *   while it was searching
 * - PageResultDetector, ScheduleResultDetector, the final websocket game
 *   update (confirmed): the official result, ~14 s after the end
 */

type GameEndReporter = (
  session: LiveGameSession,
  candidate: GameEndCandidate
) => void;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class BoardRulesDetector {
  private static board: ReturnType<typeof ChessJS.chess> | null = null;

  /**
   * result decided by the last move, and the FEN after it
   * (null when chess.js can't replay the moves)
   */
  static evaluate(pgn: readonly string[]): {
    candidate: GameEndCandidate | null;
    fen: string | null;
  } {
    const lastMove = pgn[pgn.length - 1] ?? "";

    // "#" in the last move: its player wins
    const mate: GameEndCandidate | null = GameEndRules.isMateSan(lastMove)
      ? {
          outcome: GameEndRules.moverOfPly(pgn.length),
          reason: "Checkmate",
          confidence: "certain",
          source: "board",
        }
      : null;

    let fen: string | null = null;

    try {
      this.board ??= ChessJS.chess();
      this.board.actions.setPGN(pgn.slice());

      const fenHistory = this.board.fields.FenHistoryFull;
      fen = fenHistory[fenHistory.length - 1] ?? null;

      const result = mate ? null : this.board.boardResult;
      if (result) {
        return {
          candidate: { ...result, confidence: "certain", source: "board" },
          fen,
        };
      }
    } catch {
      // move not understood (e.g. not played from the initial position)
    }

    return { candidate: mate, fen };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TablebaseDetector {
  /** fen -> is a draw */
  private static readonly cache = new Map<string, boolean>();

  /**
   * a capture left 6 men or less: asks the lichess tablebase whether the
   * position is a draw, and proposes it (to be confirmed by the freeze
   * rule) unless more moves were played since
   */
  static async check(
    session: LiveGameSession,
    san: string,
    fen: string,
    propose: GameEndReporter
  ): Promise<void> {
    if (!GameEndRules.isTablebaseCandidate(san, fen)) {
      return;
    }

    const plies = session.plies;
    // the moves table is read too: the session only sees moves once it settles
    const isStale = () =>
      !session.isActive ||
      session.plies !== plies ||
      GameEndPage.readLivePgn().length !== plies;

    let isDraw = this.cache.get(fen);

    if (isDraw === undefined) {
      try {
        const response = await fetch(
          `${GameEndConfig.TABLEBASE_URL}${encodeURIComponent(fen)}`
        );
        if (!response.ok) {
          GameEndDebug.log("tablebase", `request failed (${response.status})`);
          return;
        }

        const { category } = (await response.json()) as { category?: string };
        if (category === undefined) {
          GameEndDebug.log("tablebase", "no category in the answer");
          return;
        }

        isDraw = GameEndRules.isTablebaseDraw(category);
        this.remember(fen, isDraw);

        GameEndDebug.log("tablebase", `${fen}: ${category}`);
      } catch (e) {
        // offline / rate limited: the page will tell the result
        GameEndDebug.log("tablebase", "request failed", e);
        return;
      }
    }

    if (!isDraw) {
      return;
    }

    if (isStale()) {
      GameEndDebug.log("tablebase", "draw ignored, more moves were played since");
      return;
    }

    propose(session, {
      outcome: "draw",
      reason: "Tablebase draw",
      confidence: "provisional",
      source: "tablebase",
    });
  }

  private static remember(fen: string, isDraw: boolean): void {
    this.cache.set(fen, isDraw);

    if (this.cache.size > GameEndConfig.TABLEBASE_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}

/**
 * CCC's eval draw adjudication (cutechess `-draw movenumber=50 movecount=10
 * score=10`), replayed with each mover's score as shown when its ply
 * appeared. Live scores sometimes differ from the server's by a few
 * centipawns, so the result is confirmed by the freeze rule
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class EvalDrawDetector {
  /** counts ply `ply`; the candidate when the rule fires on it */
  static onPly(
    session: LiveGameSession,
    ply: number,
    san: string,
    score: number | null
  ): GameEndCandidate | null {
    session.evalDrawCount = GameEndRules.nextEvalDrawCount(
      session.evalDrawCount,
      { san, score }
    );

    if (!GameEndRules.isEvalDrawReached(session.evalDrawCount, ply)) {
      return null;
    }

    GameEndDebug.log(
      "eval-draw",
      `ply ${ply}: ${session.evalDrawCount} plies within ±${GameEndConfig.EVAL_DRAW_MAX}`
    );

    return {
      outcome: "draw",
      reason: "Adjudication",
      confidence: "provisional",
      source: "eval-draw",
    };
  }
}

/**
 * "has the side to move's engine stopped?": its stats box (Depth, Nodes,
 * Speed, TB Hits) changes within 0.5 s of every ply during play, and never
 * after the final one
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FreezeDetector {
  /** reads the side to move's stats box (every tick) */
  static sample(session: LiveGameSession, now: number): void {
    const box = GameEndPage.readValueBox(session.sideToMove);
    session.sampleBox(box?.signature ?? null, now);
  }

  static freezeMs(): number {
    return document.hidden
      ? GameEndConfig.FREEZE_HIDDEN_MS
      : GameEndConfig.FREEZE_MS;
  }

  static state(session: LiveGameSession, now: number): FreezeState {
    return GameEndRules.freezeState(session.freezeInput(now), this.freezeMs());
  }

  /** nothing explains the end, but nothing moved for UNEXPLAINED_FREEZE_MS */
  static isLongFrozen(session: LiveGameSession, now: number): boolean {
    return (
      GameEndRules.freezeState(
        session.freezeInput(now),
        GameEndConfig.UNEXPLAINED_FREEZE_MS
      ) === "frozen"
    );
  }

  /**
   * a rule (tablebase, eval draw) explains the end: confirmed once the
   * engine to move stayed frozen (or, stats hidden, once its clock ran out
   * without a move); dropped as soon as it searches
   */
  static confirmation(
    session: LiveGameSession,
    now: number
  ): "confirm" | "drop" | "wait" {
    switch (this.state(session, now)) {
      case "frozen":
        return "confirm";
      case "active":
        return "drop";
      case "waiting":
        return "wait";
      case "unknown": {
        const flagAt = session.clock?.flagAt ?? null;
        return flagAt !== null && now >= flagAt + GameEndConfig.OVERTIME_GRACE_MS
          ? "confirm"
          : "wait";
      }
      default:
        return "wait";
    }
  }
}

/** when the side to move runs out of time */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ClockWatch {
  /**
   * called right after a move (`movedAt`: when it arrived) and on every
   * tick: reads the side to move's clock once to know when it runs out of
   * time, then checks a moment later that this clock is the one counting down
   */
  static track(session: LiveGameSession, now: number, movedAt?: number): void {
    const color = session.sideToMove;
    const clock = session.clock;

    if (!clock) {
      const seconds = GameEndPage.readClockSeconds(color);
      if (seconds === null) {
        // engines tab hidden, or the clock was cleared at zero
        return;
      }

      session.clock = {
        color,
        seconds,
        readAt: now,
        flagAt: GameEndRules.flagTime(seconds, now, movedAt),
        verified: false,
      };
      GameEndDebug.log("clock", `${color} to move with ${seconds} s`);
      return;
    }

    if (
      clock.verified ||
      now - clock.readAt < GameEndConfig.CLOCK_RUNNING_CHECK_MS
    ) {
      return;
    }

    const seconds = GameEndPage.readClockSeconds(clock.color);
    const stopped = GameEndRules.isClockStopped(clock.seconds, seconds);

    session.clock = {
      ...clock,
      verified: true,
      flagAt: stopped ? null : clock.flagAt,
    };

    if (stopped) {
      GameEndDebug.log(
        "clock",
        `${clock.color} clock is not running (${clock.seconds} s -> ${seconds} s): ignored`
      );
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TimeForfeitDetector {
  /**
   * the side to move's clock ran out OVERTIME_GRACE_MS ago and its engine
   * searched until then: the opponent wins, or it is a draw if the
   * opponent can't mate
   */
  static check(
    session: LiveGameSession,
    now: number
  ): { flag: FlagState; candidate: GameEndCandidate | null } {
    const flag = GameEndRules.classifyFlag({
      ...session.freezeInput(now),
      flagAt: session.clock?.flagAt ?? null,
    });

    if (flag !== "time-forfeit") {
      return { flag, candidate: null };
    }

    const flagged = session.sideToMove;
    const outcome = GameEndRules.timeForfeitOutcome(session.fen, flagged);

    GameEndDebug.log("time-forfeit", `${flagged} lost on time: ${outcome}`, {
      turnIndicator: GameEndPage.readTurnIndicator(),
    });

    return {
      flag,
      candidate: {
        outcome,
        reason: "Time forfeit",
        confidence: "provisional",
        source: "time-forfeit",
      },
    };
  }
}

/**
 * results forwarded from the CCC websocket by inject/index.js (page
 * world): `result` right after the last move, and the finished game's
 * `gameUpdate` ~14 s later
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PageSocketDetector {
  /**
   * server numbers of the last live games (`live` game updates), newest
   * last: the finished game's update may come after the next game's
   */
  private static readonly liveGameNrs: string[] = [];

  static init(onMessage: (message: PageSocketMessage) => void): void {
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const message = GameEndRules.parsePageMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "gameUpdate" && message.live) {
        this.rememberLiveGame(message.gameNr);
      }

      try {
        onMessage(message);
      } catch (e) {
        Utils.logError(e);
      }
    });
  }

  static get recentLiveGameNrs(): readonly string[] {
    return this.liveGameNrs;
  }

  private static rememberLiveGame(gameNr: string): void {
    if (this.liveGameNrs[this.liveGameNrs.length - 1] === gameNr) {
      return;
    }

    this.liveGameNrs.push(gameNr);
    if (this.liveGameNrs.length > 2) {
      this.liveGameNrs.shift();
    }
    GameEndDebug.log("socket", `live game ${gameNr}`);
  }

  /**
   * the toast shows the engine names of the page (`known`) when there are
   * any: the message only had to match them
   */
  static resultCandidate(
    message: Extract<PageSocketMessage, { type: "result" }>,
    known: { white: string; black: string }
  ): GameEndCandidate {
    return {
      outcome: message.outcome,
      reason: GameEndRules.socketReasonLabel(message.reason, message.outcome),
      confidence: "certain",
      source: "page-socket",
      white: known.white || message.whiteName,
      black: known.black || message.blackName,
    };
  }

  /** null while the game update has no result */
  static finalUpdateCandidate(
    message: Extract<PageSocketMessage, { type: "gameUpdate" }>
  ): GameEndCandidate | null {
    if (!message.outcome) {
      return null;
    }

    return {
      outcome: message.outcome,
      reason: message.termination
        ? GameEndRules.terminationLabel(message.termination)
        : "",
      confidence: "confirmed",
      source: "page-socket",
      moveCount:
        message.plyCount !== null
          ? GameEndRules.fullMoves(message.plyCount)
          : undefined,
      white: message.white || undefined,
      black: message.black || undefined,
    };
  }
}

/**
 * the result box of the moves table / the engine panels' colors: shown
 * ~14 s after the end when no next game follows at once (end of an event)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PageResultDetector {
  static check(session: LiveGameSession): GameEndCandidate | null {
    const result = GameEndPage.readPageResult();
    if (!result) {
      return null;
    }

    // the box belongs to the game in the moves table
    const pgn = GameEndPage.readLivePgn();
    if (pgn.length !== session.plies) {
      return null;
    }

    GameEndDebug.log("page-result", `${result.outcome} (${result.reason})`);

    return {
      outcome: result.outcome,
      reason: result.reason,
      confidence: "confirmed",
      source: "page-result",
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ScheduleResultDetector {
  /** "event id|game number" of the schedule results already used */
  private static readonly usedResults = new Set<string>();
  private static readonly USED_RESULTS_KEPT = 200;

  /**
   * the watched game was replaced by the next one: its result appears in
   * the schedule row right before the new "in progress" one.
   * `isStillReplaced` false = the moves table only re-rendered, stop
   */
  static async afterGameReplaced(
    session: LiveGameSession,
    report: GameEndReporter,
    isStillReplaced: () => boolean
  ): Promise<void> {
    const deadline = Date.now() + GameEndConfig.RESULT_TIMEOUT_MS;
    let peeks = 0;

    while (true) {
      if (!isStillReplaced()) {
        GameEndDebug.log("schedule", "the watched game is back, no result to read");
        return;
      }
      if (session.isSettled) {
        // e.g. the final websocket game update came meanwhile
        return;
      }

      // the tab is only opened while no result at all was shown, a few times
      const allowPeek =
        !session.hasStandingResult && peeks < GameEndConfig.SCHEDULE_MAX_PEEKS;
      if (allowPeek && !GameEndPage.readScheduleRows()) {
        peeks += 1;
      }

      const pick = await GameEndPage.findInSchedule(
        (rows) =>
          GameEndRules.pickFinishedRow(rows, session.watchedGame(), "replaced"),
        allowPeek
      );

      if (pick.status === "found") {
        this.use(session, pick.row, report);
        return;
      }
      if (pick.status === "rejected") {
        GameEndDebug.log("schedule", `no result: ${pick.why}`);
        return;
      }
      if (Date.now() + GameEndConfig.SCHEDULE_RETRY_MS > deadline) {
        GameEndDebug.log("schedule", `no result in time: ${pick.why}`);
        return;
      }

      GameEndDebug.log("schedule", `waiting: ${pick.why}`);
      await Utils.sleepAsync(GameEndConfig.SCHEDULE_RETRY_MS);
    }
  }

  /**
   * at the end of an event no next game replaces the watched one: a while
   * after the end (or a long idle time), look for the watched game among
   * the last finished rows. Called on every tick, checks a few times then
   * gives up (the counter starts over with every move)
   */
  static checkEventEnd(
    session: LiveGameSession,
    now: number,
    freeze: FreezeState,
    report: GameEndReporter
  ): void {
    const suspected = GameEndRules.isEventEndSuspected({
      now,
      lastMoveAt: session.lastMoveAt,
      endedAt: session.endedAt,
      freeze,
    });

    if (
      !suspected ||
      document.hidden ||
      session.eventEndCheckRunning ||
      session.eventEndChecks >= GameEndConfig.EVENT_END_MAX_CHECKS ||
      now < session.nextEventEndCheckAt
    ) {
      return;
    }

    session.eventEndChecks += 1;
    session.nextEventEndCheckAt = now + GameEndConfig.EVENT_END_RETRY_MS;
    session.eventEndCheckRunning = true;

    GameEndPage.findInSchedule(
      (rows) =>
        GameEndRules.pickFinishedRow(rows, session.watchedGame(), "event-end"),
      !session.hasStandingResult
    )
      .then((pick) => {
        if (pick.status === "found") {
          this.use(session, pick.row, report);
        } else {
          GameEndDebug.log(
            "schedule",
            `event end check ${session.eventEndChecks}: ${pick.why}`
          );
        }
      })
      .catch((e) => Utils.logError(e))
      .finally(() => {
        session.eventEndCheckRunning = false;
      });
  }

  private static use(
    session: LiveGameSession,
    row: FinishedScheduleRow,
    report: GameEndReporter
  ): void {
    const key = [_State.eventId ?? "", row.gameNumber].join("|");

    if (this.usedResults.has(key)) {
      GameEndDebug.log("schedule", `game ${row.gameNumber} already reported`);
      return;
    }
    this.usedResults.add(key);

    if (this.usedResults.size > this.USED_RESULTS_KEPT) {
      const oldest = this.usedResults.values().next().value;
      if (oldest !== undefined) {
        this.usedResults.delete(oldest);
      }
    }

    report(session, {
      outcome: row.outcome,
      reason: row.gameNumber ? `Game ${row.gameNumber}` : "",
      confidence: "confirmed",
      source: "schedule",
      moveCount: row.moveCount ?? undefined,
      white: row.white,
      black: row.black,
    });
  }
}
