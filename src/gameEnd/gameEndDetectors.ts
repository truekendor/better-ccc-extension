/**
 * Live game end detection, part 3 of 4: the detectors.
 *
 * Each one looks at the watched game (a LiveGameSession) and proposes a
 * result (a GameEndCandidate) that the arbiter shows or not:
 * - BoardRulesDetector (certain): mate, stalemate, repetition, 50 moves,
 *   insufficient material, as soon as the move is played
 * - TablebaseDetector (certain): drawn positions with 6 pieces or less,
 *   which CCC adjudicates at once
 * - TimeForfeitDetector (provisional): the side to move ran out of time
 *   while it was searching
 * - AdjudicationDetector (provisional): the game is over (clock ran out or
 *   engines idle) without a reason on the board: guessed from the evals
 * - ScheduleResultDetector (confirmed): the official result in the schedule
 *   once the next game started, or when the event is over
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
          outcome: GameEndRules.opponent(GameEndRules.sideToMove(pgn.length)),
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

    GameEndDebug.log(
      "board",
      mate ? `mate on the board (${lastMove})` : "no result on the board"
    );

    return { candidate: mate, fen };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TablebaseDetector {
  /** fen -> is a draw */
  private static readonly cache = new Map<string, boolean>();

  /**
   * asks the lichess tablebase whether the position after the last move
   * is a draw, and reports it unless more moves were played since
   */
  static async check(
    session: LiveGameSession,
    fen: string,
    report: GameEndReporter
  ): Promise<void> {
    if (GameEndRules.countPieces(fen) > GameEndConfig.TB_MAX_PIECES) {
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
        isDraw = GameEndRules.isTablebaseDraw(category);
        this.remember(fen, isDraw);

        GameEndDebug.log("tablebase", `${fen}: ${category}`);
      } catch (e) {
        // offline / rate limited: the schedule will tell the result
        GameEndDebug.log("tablebase", "request failed", e);
        return;
      }
    }

    if (!isDraw) {
      return;
    }

    // a move right after it would mean CCC did not adjudicate the position
    const wait =
      GameEndConfig.TABLEBASE_CONFIRM_MS - (Date.now() - session.lastMoveAt);
    if (wait > 0) {
      await Utils.sleepAsync(wait);
    }

    if (isStale()) {
      GameEndDebug.log("tablebase", "draw ignored, more moves were played since");
      return;
    }

    report(session, {
      outcome: "draw",
      reason: "Tablebase draw",
      confidence: "certain",
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
 * shared "is the game over?" signal of the time forfeit and adjudication
 * detectors, from the side to move's clock and the engines' output
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameOverSignal {
  /**
   * called right after a move (`movedAt`: when it arrived) and on every
   * tick: reads the side to move's clock once to know when it runs out of
   * time, then checks a moment later that this clock is the one counting down
   */
  static trackClock(
    session: LiveGameSession,
    now: number,
    movedAt?: number
  ): void {
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

  static read(session: LiveGameSession, now: number): GameOverState {
    return GameEndRules.classifyGameOver({
      now,
      lastMoveAt: session.lastMoveAt,
      statsChangedAt: session.statsChangedAt,
      flagAt: session.clock?.flagAt ?? null,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TimeForfeitDetector {
  /**
   * the side to move ran out of time while searching: the opponent wins,
   * or it is a draw if the opponent can't mate
   */
  static check(
    session: LiveGameSession,
    state: GameOverState
  ): GameEndCandidate | null {
    if (!state.over || state.end !== "time-forfeit") {
      return null;
    }

    const flagged = session.sideToMove;
    const outcome = GameEndRules.timeForfeitOutcome(session.fen, flagged);

    GameEndDebug.log("time-forfeit", `${flagged} lost on time: ${outcome}`, {
      why: state.why,
      turnIndicator: GameEndPage.readTurnIndicator(),
    });

    return {
      outcome,
      reason: "Time forfeit",
      confidence: "provisional",
      source: "time-forfeit",
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class AdjudicationDetector {
  /**
   * the game is over with no reason on the board: CCC adjudicated it.
   * Draw when both evals are close to 0, a win when both engines agree on a
   * big advantage (needs the eval sign, see EvalConvention), otherwise
   * nothing (the schedule will tell)
   */
  static check(
    session: LiveGameSession,
    state: GameOverState
  ): GameEndCandidate | null {
    if (!state.over) {
      GameEndDebug.log("adjudication", `game not over: ${state.why}`);
      return null;
    }

    if (state.end !== "adjudication") {
      GameEndDebug.log(
        "adjudication",
        `game over (${state.by}), not guessing: ${state.why}`
      );
      return null;
    }

    const evals = this.readEvals(session);
    const outcome = GameEndRules.inferAdjudication(evals);
    const details = {
      by: state.by,
      why: state.why,
      evals: evals.map((reading) => reading?.text ?? null),
      turnIndicator: GameEndPage.readTurnIndicator(),
    };

    if (!outcome) {
      GameEndDebug.log(
        "adjudication",
        "game over, evals inconclusive: waiting for the schedule",
        details
      );
      return null;
    }

    GameEndDebug.log("adjudication", `game over: ${outcome}`, details);

    return {
      outcome,
      reason: "Adjudication",
      confidence: "provisional",
      source: "adjudication",
    };
  }

  /** one eval per engine: the engine panels, else the stats block rows */
  private static readEvals(
    session: LiveGameSession
  ): (EngineEvalReading | null)[] {
    const fromPanels = [
      GameEndPage.readEvalForColor("white"),
      GameEndPage.readEvalForColor("black"),
    ];

    if (fromPanels.every(Boolean)) {
      return fromPanels;
    }

    const fromStats = GameEndRules.statsEvalReadings(session.statsText);

    return fromStats.length === 2 ? fromStats : fromPanels;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ScheduleResultDetector {
  /** "event id|game number" of the schedule results already used */
  private static readonly usedResults = new Set<string>();

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

    while (true) {
      if (!isStillReplaced()) {
        GameEndDebug.log("schedule", "the watched game is back, no result to read");
        return;
      }

      const pick = await GameEndPage.findInSchedule((rows) =>
        GameEndRules.pickFinishedRow(rows, session.watchedGame(), "replaced")
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
   * at the end of an event no next game replaces the watched one: after a
   * long idle time, look for the watched game among the last finished rows.
   * Called on every tick, checks a few times then gives up
   */
  static checkEventEnd(
    session: LiveGameSession,
    now: number,
    report: GameEndReporter
  ): void {
    const suspected = GameEndRules.isEventEndSuspected({
      now,
      lastMoveAt: session.lastMoveAt,
      statsChangedAt: session.statsChangedAt,
    });

    if (
      !suspected ||
      session.eventEndCheckRunning ||
      session.eventEndChecks >= GameEndConfig.EVENT_END_MAX_CHECKS ||
      now < session.nextEventEndCheckAt
    ) {
      return;
    }

    session.eventEndChecks += 1;
    session.nextEventEndCheckAt = now + GameEndConfig.EVENT_END_RETRY_MS;
    session.eventEndCheckRunning = true;

    GameEndPage.findInSchedule((rows) =>
      GameEndRules.pickFinishedRow(rows, session.watchedGame(), "event-end")
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
