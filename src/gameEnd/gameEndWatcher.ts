/**
 * Live game end detection, part 4 of 4: follows the live game and feeds
 * the detectors.
 *
 * CCC never renders a result for the live game. When it ends, the moves
 * table keeps the final position for ~14 s, then jumps to the next game
 * (same <table>, pre-filled with its book moves), and only then the
 * schedule shows the score. So the live game is tracked as a session:
 * - new move: board rules, tablebase
 * - every TICK_MS: clocks and engine output (time forfeit, adjudication),
 *   end of the event
 * - the table shows another, shorter game: the schedule result
 * - hash change (archived game opened): the session is put aside and
 *   resumed when the live game is displayed again
 * Every result goes through GameEndArbiter, so each game gets one toast.
 */

type SessionClock = {
  color: EngineColor;
  /** remaining time read right after the move */
  seconds: number;
  readAt: number;
  /** when the side to move runs out of time, null if the reading is wrong */
  flagAt: number | null;
  /** checked a moment later that this clock is counting down */
  verified: boolean;
};

/** the live game being watched */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class LiveGameSession {
  private static lastId = 0;

  readonly id = ++LiveGameSession.lastId;
  /** suspended: an archived game is displayed; ended: replaced or dropped */
  state: "active" | "suspended" | "ended" = "active";

  pgn: string[];
  readonly startedAt: number;
  /** when the last move was seen (or the session started) */
  lastMoveAt: number;
  /** moves seen being played; 0 = the game was already there */
  movesSeen = 0;
  readonly names = { white: "", black: "" };
  /** position after the last move, null if chess.js can't replay the game */
  fen: string | null = null;
  /** schedule number, once seen "in progress" there */
  gameNumber: string | null = null;

  /** result shown for this game (arbiter state) */
  shown: ShownResult | null = null;

  // engine output
  statsText: string | null = null;
  statsSignature: string | null = null;
  /** when the stats text last changed, null while it is not displayed */
  statsChangedAt: number | null = null;

  /** side to move's clock, read after the last move */
  clock: SessionClock | null = null;

  // end of event checks
  eventEndChecks = 0;
  nextEventEndCheckAt = 0;
  eventEndCheckRunning = false;

  constructor(pgn: string[], now: number) {
    this.pgn = pgn;
    this.startedAt = now;
    this.lastMoveAt = now;
  }

  get plies(): number {
    return this.pgn.length;
  }

  get fullMoves(): number {
    return GameEndRules.fullMoves(this.plies);
  }

  get sideToMove(): EngineColor {
    return (
      GameEndRules.sideToMoveFromFen(this.fen) ??
      GameEndRules.sideToMove(this.plies)
    );
  }

  get positionKey(): string {
    return this.pgn.join(" ");
  }

  get isActive(): boolean {
    return this.state === "active";
  }

  /** a result is shown and nothing contradicted it since */
  get hasStandingResult(): boolean {
    return !!this.shown && !this.shown.refuted;
  }

  /** a certain / confirmed result is shown: nothing can change it */
  get isSettled(): boolean {
    return this.hasStandingResult && this.shown!.confidence !== "provisional";
  }

  watchedGame(): WatchedGame {
    return {
      plies: this.plies,
      white: this.names.white,
      black: this.names.black,
      gameNumber: this.gameNumber,
    };
  }

  /** a new move: the clocks and the "game over" signals start over */
  addMoves(pgn: string[], now: number): void {
    this.pgn = pgn;
    this.lastMoveAt = now;
    this.movesSeen += 1;
    this.clock = null;
  }

  sampleStats(text: string | null, now: number): void {
    const signature = GameEndRules.statsSignature(text);

    this.statsText = text;

    if (signature === null) {
      // not displayed: unknown, not frozen
      this.statsSignature = null;
      this.statsChangedAt = null;
      return;
    }

    if (signature !== this.statsSignature) {
      this.statsSignature = signature;
      this.statsChangedAt = now;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndWatcher {
  /** the live game, null while an archived game is displayed */
  private static session: LiveGameSession | null = null;
  /** live game put aside while an archived game is displayed */
  private static suspended: LiveGameSession | null = null;
  private static settleTimerId = 0;
  /** first moves table mutation of the current burst: when the move arrived */
  private static firstMutationAt = 0;

  /**
   * results shown by final position: a table re-rendered with the same
   * moves must not report them again
   */
  private static readonly resultsByPosition = new Map<string, ShownResult>();
  private static readonly RESULTS_KEPT = 20;

  static init(): void {
    const table = _DOM_Store.movesTable;

    if (!table) {
      return;
    }

    this.updateFromMovesTable();

    const movesObserver = new MutationObserver(() => {
      this.firstMutationAt ||= Date.now();
      this.scheduleUpdate();
    });
    movesObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("hashchange", () => {
      this.onHashChange();
    });

    window.setInterval(() => {
      try {
        this.onTick();
      } catch (e) {
        Utils.logError(e);
      }
    }, GameEndConfig.TICK_MS);
  }

  static getEngineName(color: EngineColor): string {
    return (
      GameEndPage.readEngineName(color) || this.session?.names[color] || ""
    );
  }

  // * =========================
  // * events

  private static scheduleUpdate(): void {
    clearTimeout(this.settleTimerId);
    this.settleTimerId = window.setTimeout(() => {
      try {
        this.updateFromMovesTable();
      } catch (e) {
        Utils.logError(e);
      }
    }, GameEndConfig.SETTLE_DELAY_MS);
  }

  /**
   * opening an archived game (or going back to the live one) replaces the
   * moves too: put the live game aside instead of reporting a game end
   */
  private static onHashChange(): void {
    const session = this.session;

    if (session) {
      session.state = "suspended";
      this.suspended = session;
      this.session = null;
      GameEndDebug.log("session", `#${session.id} suspended (hash change)`);
    }

    this.scheduleUpdate();
  }

  private static updateFromMovesTable(): void {
    const changedAt = this.firstMutationAt || Date.now();
    this.firstMutationAt = 0;

    if (GameEndPage.isArchiveView()) {
      if (this.session) {
        this.onHashChange();
      }
      return;
    }

    const pgn = GameEndPage.readLivePgn();

    // table is being re-rendered
    if (pgn.length === 0) {
      return;
    }

    const session = this.session;

    if (!session) {
      this.resumeOrStart(pgn, changedAt);
      return;
    }

    if (GameEndRules.isContinuation(session.pgn, pgn)) {
      if (pgn.length > session.plies) {
        this.onNewMoves(session, pgn, changedAt);
      }
      return;
    }

    this.onGameReplaced(session, pgn);
  }

  /** back on the live game: same game as before the hash change? */
  private static resumeOrStart(pgn: string[], changedAt: number): void {
    const suspended = this.suspended;
    this.suspended = null;

    if (suspended && GameEndRules.isContinuation(suspended.pgn, pgn)) {
      suspended.state = "active";
      this.session = suspended;
      GameEndDebug.log("session", `#${suspended.id} resumed`);

      if (pgn.length > suspended.plies) {
        this.onNewMoves(suspended, pgn, changedAt);
      }
      return;
    }

    if (suspended) {
      suspended.state = "ended";
      GameEndDebug.log(
        "session",
        `#${suspended.id} dropped, another game is live now`
      );
    }

    this.startSession(pgn);
  }

  private static startSession(pgn: string[]): void {
    const session = new LiveGameSession(pgn, Date.now());

    session.shown = this.resultsByPosition.get(session.positionKey) ?? null;
    this.cacheEngineNames(session);
    this.session = session;

    GameEndDebug.log(
      "session",
      `#${session.id} started at ply ${session.plies} (${session.names.white} - ${session.names.black})`
    );
  }

  /** `movedAt`: when the moves table started changing */
  private static onNewMoves(
    session: LiveGameSession,
    pgn: string[],
    movedAt: number
  ): void {
    const now = Date.now();

    session.addMoves(pgn, movedAt);

    // the game went on: the result shown was wrong
    if (session.shown && !session.shown.refuted) {
      session.shown = { ...session.shown, refuted: true };
      GameEndDebug.log(
        "arbiter",
        `#${session.id} moves played after the ${session.shown.confidence} result ${session.shown.outcome}`
      );
    }
    // ... unless it is the same final position re-rendered
    const known = this.resultsByPosition.get(session.positionKey);
    if (known) {
      session.shown = known;
    }

    this.cacheEngineNames(session);

    const { candidate, fen } = BoardRulesDetector.evaluate(pgn);
    session.fen = fen;

    GameOverSignal.trackClock(session, now, movedAt);

    if (candidate) {
      this.report(session, candidate);
      return;
    }

    if (fen) {
      void TablebaseDetector.check(session, fen, (s, c) => this.report(s, c));
    }
  }

  private static onGameReplaced(
    previous: LiveGameSession,
    pgn: string[]
  ): void {
    const now = Date.now();
    const isNextGame = GameEndRules.isNextGame(
      { plies: previous.plies, watchedMs: now - previous.startedAt },
      pgn.length
    );

    previous.state = "ended";
    GameEndDebug.log(
      "session",
      `#${previous.id} replaced at ply ${previous.plies} by a game at ply ${pgn.length}` +
        (isNextGame ? "" : " (not a game end)")
    );

    this.startSession(pgn);

    if (isNextGame && !previous.isSettled) {
      void ScheduleResultDetector.afterGameReplaced(
        previous,
        (s, c) => this.report(s, c),
        // the table was only re-rendered: the old game is back
        () =>
          !GameEndRules.isContinuation(previous.pgn, this.session?.pgn ?? [])
      );
    }
  }

  private static onTick(): void {
    if (GameEndPage.isArchiveView()) {
      return;
    }

    const session = this.session;
    if (!session || !session.isActive) {
      return;
    }

    const now = Date.now();

    this.cacheEngineNames(session);
    session.sampleStats(GameEndPage.readStatsText(), now);

    // only games seen being played: not one that ended before the page loaded
    if (session.movesSeen === 0 || session.plies < GameEndConfig.MIN_PLIES) {
      return;
    }

    this.captureGameNumber(session, now);

    if (session.isSettled) {
      return;
    }

    if (!session.hasStandingResult) {
      GameOverSignal.trackClock(session, now);

      const state = GameOverSignal.read(session, now);
      const candidate =
        TimeForfeitDetector.check(session, state) ??
        AdjudicationDetector.check(session, state);

      if (candidate) {
        this.report(session, candidate);
      }
    }

    ScheduleResultDetector.checkEventEnd(session, now, (s, c) =>
      this.report(s, c)
    );
  }

  // * =========================
  // * results

  /** every detector result goes through the arbiter */
  private static report(
    session: LiveGameSession,
    candidate: GameEndCandidate
  ): void {
    const decision = GameEndArbiter.decide(session.shown, candidate);

    GameEndDebug.log(
      "arbiter",
      `#${session.id} ${candidate.source} (${candidate.confidence}) ${candidate.outcome}: ` +
        `${decision.notify ? "toast" : "no toast"}, ${decision.why}`
    );

    session.shown = decision.next;
    this.rememberResult(session);

    if (!decision.notify) {
      return;
    }

    // the panels show the next game once the session ended
    const name = (color: EngineColor) =>
      candidate[color] ||
      session.names[color] ||
      (session.isActive ? GameEndPage.readEngineName(color) : "");

    GameResultToast.notify({
      outcome: candidate.outcome,
      white: name("white"),
      black: name("black"),
      reason: GameEndRules.formatReason(
        candidate.reason,
        candidate.moveCount ?? session.fullMoves,
        decision.corrected
      ),
      moveCount: candidate.moveCount,
    });
  }

  private static rememberResult(session: LiveGameSession): void {
    if (!session.shown) {
      return;
    }

    this.resultsByPosition.delete(session.positionKey);
    this.resultsByPosition.set(session.positionKey, session.shown);

    if (this.resultsByPosition.size > this.RESULTS_KEPT) {
      const oldest = this.resultsByPosition.keys().next().value;
      if (oldest !== undefined) {
        this.resultsByPosition.delete(oldest);
      }
    }
  }

  // * =========================
  // * cached page data

  private static cacheEngineNames(session: LiveGameSession): void {
    const white = GameEndPage.readEngineName("white");
    const black = GameEndPage.readEngineName("black");

    if (white) {
      session.names.white = white;
    }
    if (black) {
      session.names.black = black;
    }
  }

  /**
   * the schedule number of the live game, when the schedule happens to be
   * open: lets the schedule result be matched by number
   */
  private static captureGameNumber(session: LiveGameSession, now: number): void {
    if (
      session.gameNumber ||
      now - session.startedAt < GameEndConfig.MIN_WATCH_TIME_MS
    ) {
      return;
    }

    const live = GameEndPage.readScheduleRows()?.find((row) => row.inProgress);

    if (live?.gameNumber) {
      session.gameNumber = live.gameNumber;
      GameEndDebug.log("session", `#${session.id} is game ${live.gameNumber}`);
    }
  }
}
