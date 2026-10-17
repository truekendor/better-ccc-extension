/**
 * Live game end detection, part 4 of 4: follows the live game and feeds
 * the detectors.
 *
 * CCC renders no result for the live game while the next one follows: the
 * moves table keeps the final position for ~14 s, then jumps to the next
 * game (same <table>, pre-filled with its book moves). So the live game is
 * tracked as a session:
 * - a ply appears (moves table mutation): snapshot of the engine stats
 * - the moves settled: board rules, CCC's eval draw rule, tablebase
 * - every TICK_MS: freeze rule (confirms an explained end), time forfeit,
 *   result box, end of the event
 * - websocket messages from inject/index.js: CCC's own result
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

/** the side to move's stats box since the last ply */
type BoxTracking = {
  /** when the last ply appeared, or the box became readable */
  since: number | null;
  /** last signature seen (GameEndRules.valueBoxSignature) */
  last: string | null;
  known: boolean;
  /** last change since `since`, null if it never changed */
  changedAt: number | null;
};

/** the page when a ply appeared in the moves table */
type PlySnapshot = {
  at: number;
  /** score of the engine that played the ply */
  moverScore: number | null;
  moverBox: string | null;
  sideToMoveBox: string | null;
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
  /** when the last ply appeared (or the session started) */
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
  shownAt = 0;

  /** CCC's eval draw counter (GameEndRules.nextEvalDrawCount) */
  evalDrawCount = 0;
  box: BoxTracking = { since: null, last: null, known: false, changedAt: null };
  /** an end explained by a rule, waiting for the freeze rule */
  pendingEnd: GameEndCandidate | null = null;
  /** "ended, result unknown": nothing explains it, the engines are idle */
  endedAt: number | null = null;

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

  /**
   * a new ply (`movedAt`: when it appeared, `boxBaseline`: the side to
   * move's stats box then): everything about the end starts over
   */
  addMoves(pgn: string[], movedAt: number, boxBaseline: string | null): void {
    this.pgn = pgn;
    this.lastMoveAt = movedAt;
    this.movesSeen += 1;
    this.clock = null;
    this.box =
      boxBaseline !== null
        ? { since: movedAt, last: boxBaseline, known: true, changedAt: null }
        : { since: null, last: null, known: false, changedAt: null };
    this.pendingEnd = null;
    this.endedAt = null;
    this.eventEndChecks = 0;
    this.nextEventEndCheckAt = 0;
  }

  /** the side to move's stats box now (null: not displayed) */
  sampleBox(signature: string | null, now: number): void {
    if (signature === null) {
      this.box.known = false;
      return;
    }

    if (this.box.last === null) {
      // first reading since the ply: the freeze counts from now
      this.box = { since: now, last: signature, known: true, changedAt: null };
      return;
    }

    this.box.known = true;
    if (signature !== this.box.last) {
      this.box.last = signature;
      this.box.changedAt = now;
    }
  }

  freezeInput(now: number): FreezeInput {
    return {
      now,
      since: this.box.since,
      boxKnown: this.box.known,
      changedAt: this.box.changedAt,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndWatcher {
  /** the live game, null while an archived game is displayed */
  private static session: LiveGameSession | null = null;
  /** live game put aside while an archived game is displayed */
  private static suspended: LiveGameSession | null = null;
  /** the game replaced last (its final update may still come) */
  private static lastEnded: LiveGameSession | null = null;
  private static settleTimerId = 0;
  /** first moves table mutation of the current burst: when the move arrived */
  private static firstMutationAt = 0;

  /** "ply count:last move" -> page when that ply appeared */
  private static readonly plySnapshots = new Map<string, PlySnapshot>();
  /** a snapshot older than this belongs to another game */
  private static readonly SNAPSHOT_MAX_AGE_MS = 10_000;

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
      this.onTableMutation();
    });
    movesObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("hashchange", () => {
      this.onHashChange();
    });

    PageSocketDetector.init((message) => this.onPageMessage(message));

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
  // * moves table

  private static onTableMutation(): void {
    const now = Date.now();

    this.firstMutationAt ||= now;

    try {
      this.takePlySnapshot(now);
    } catch (e) {
      Utils.logError(e);
    }

    this.scheduleUpdate();
  }

  private static snapshotKey(plies: number, san: string): string {
    return `${plies}:${san}`;
  }

  /**
   * a ply just appeared: what the engines show at that moment (the mover's
   * final score, the side to move's stats before it searches)
   */
  private static takePlySnapshot(now: number): void {
    if (GameEndPage.isArchiveView()) {
      return;
    }

    const pgn = GameEndPage.readLivePgn();
    const plies = pgn.length;
    if (plies === 0) {
      return;
    }

    const key = this.snapshotKey(plies, pgn[plies - 1]!);
    const existing = this.plySnapshots.get(key);
    if (existing && now - existing.at < this.SNAPSHOT_MAX_AGE_MS) {
      return;
    }

    const mover = GameEndRules.moverOfPly(plies);
    const moverBox = GameEndPage.readValueBox(mover);
    const score = moverBox?.eval ?? GameEndPage.readEvalForColor(mover);

    this.plySnapshots.delete(key);
    this.plySnapshots.set(key, {
      at: now,
      moverScore: score?.pawns ?? null,
      moverBox: moverBox?.signature ?? null,
      sideToMoveBox:
        GameEndPage.readValueBox(GameEndRules.opponent(mover))?.signature ??
        null,
    });

    if (this.plySnapshots.size > GameEndConfig.PLY_SNAPSHOTS_KEPT) {
      const oldest = this.plySnapshots.keys().next().value;
      if (oldest !== undefined) {
        this.plySnapshots.delete(oldest);
      }
    }
  }

  private static snapshotFor(
    pgn: readonly string[],
    ply: number,
    now: number
  ): PlySnapshot | null {
    const san = pgn[ply - 1];
    if (!san) {
      return null;
    }

    const snapshot = this.plySnapshots.get(this.snapshotKey(ply, san));

    return snapshot && now - snapshot.at < this.SNAPSHOT_MAX_AGE_MS
      ? snapshot
      : null;
  }

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

  /** runs the pending settle update now (a result arrived before it) */
  private static flushMovesTable(): void {
    if (!this.firstMutationAt) {
      return;
    }

    clearTimeout(this.settleTimerId);
    this.updateFromMovesTable();
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
      this.lastEnded = suspended;
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
    const lastPly = pgn.length;

    const { candidate, fen } = BoardRulesDetector.evaluate(pgn);

    // CCC's eval draw rule, ply by ply, with each mover's score
    let evalDraw: GameEndCandidate | null = null;
    for (let ply = session.plies + 1; ply <= lastPly; ply++) {
      const snapshot = this.snapshotFor(pgn, ply, now);
      const before = this.snapshotFor(pgn, ply - 1, now);

      let score = snapshot
        ? snapshot.moverScore
        : ply === lastPly
        ? GameEndPage.readScore(GameEndRules.moverOfPly(ply))?.pawns ?? null
        : null;

      // the mover printed nothing while thinking (instant move): its box
      // shows an older search, CCC counts it like a book move
      if (
        snapshot?.moverBox &&
        before?.sideToMoveBox &&
        snapshot.moverBox === before.sideToMoveBox
      ) {
        score = null;
      }

      const fired = EvalDrawDetector.onPly(session, ply, pgn[ply - 1]!, score);
      evalDraw = ply === lastPly ? fired : null;
    }

    const lastSnapshot = this.snapshotFor(pgn, lastPly, now);
    const sideToMove =
      GameEndRules.sideToMoveFromFen(fen) ?? GameEndRules.sideToMove(lastPly);
    const baseline =
      lastSnapshot?.sideToMoveBox ??
      GameEndPage.readValueBox(sideToMove)?.signature ??
      null;

    session.addMoves(pgn, lastSnapshot?.at ?? movedAt, baseline);
    session.fen = fen;

    this.refuteShownResult(session, now, "moves were played");

    // ... unless it is the same final position re-rendered
    const known = this.resultsByPosition.get(session.positionKey);
    if (known) {
      session.shown = known;
    }

    this.cacheEngineNames(session);
    ClockWatch.track(session, now, session.lastMoveAt);

    if (candidate) {
      this.report(session, candidate);
      return;
    }

    if (evalDraw) {
      this.propose(session, evalDraw);
    }

    const lastMove = pgn[lastPly - 1]!;
    if (fen) {
      TablebaseDetector.check(session, lastMove, fen, (s, c) =>
        this.propose(s, c)
      ).catch((e) => Utils.logError(e));
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
    this.lastEnded = previous;
    GameEndDebug.log(
      "session",
      `#${previous.id} replaced at ply ${previous.plies} by a game at ply ${pgn.length}` +
        (isNextGame ? "" : " (not a game end)")
    );

    this.startSession(pgn);

    if (isNextGame && !previous.isSettled) {
      ScheduleResultDetector.afterGameReplaced(
        previous,
        (s, c) => this.report(s, c),
        // the table was only re-rendered: the old game is back
        () =>
          !GameEndRules.isContinuation(previous.pgn, this.session?.pgn ?? [])
      ).catch((e) => Utils.logError(e));
    }
  }

  // * =========================
  // * every tick

  private static onTick(): void {
    if (GameEndPage.isArchiveView()) {
      return;
    }

    const session = this.session;
    if (!session || !session.isActive) {
      return;
    }

    // the moves table changed and the settle timer hasn't run yet: the
    // panels and the schedule may already show the next game
    if (!this.isShownInMovesTable(session)) {
      return;
    }

    const now = Date.now();

    this.cacheEngineNames(session);
    FreezeDetector.sample(session, now);

    // only games seen being played: not one that ended before the page loaded
    if (session.movesSeen === 0 || session.plies < GameEndConfig.MIN_PLIES) {
      return;
    }

    this.captureGameNumber(session, now);

    if (session.isSettled) {
      return;
    }

    // first: the page rebuilds the stats from the PGN when it shows the result
    const pageResult = PageResultDetector.check(session);
    if (pageResult) {
      this.report(session, pageResult);
      if (session.isSettled) {
        return;
      }
    }

    this.retractIfEngineActive(session);

    if (!session.hasStandingResult) {
      ClockWatch.track(session, now);
      this.checkGameOver(session, now);
    }

    ScheduleResultDetector.checkEventEnd(
      session,
      now,
      FreezeDetector.state(session, now),
      (s, c) => this.report(s, c)
    );
  }

  /**
   * no result yet: confirm an end a rule explains, detect a time forfeit,
   * or note "ended, result unknown" (confirmed later by the page)
   */
  private static checkGameOver(session: LiveGameSession, now: number): void {
    const pending = session.pendingEnd;

    if (pending) {
      const decision = FreezeDetector.confirmation(session, now);

      if (decision === "confirm") {
        session.pendingEnd = null;
        GameEndDebug.log("freeze", `${pending.source} confirmed: engines idle`);
        this.report(session, pending);
      } else if (decision === "drop") {
        session.pendingEnd = null;
        GameEndDebug.log("freeze", `${pending.source} dropped: the engine to move searches`);
      }
      return;
    }

    const { flag, candidate } = TimeForfeitDetector.check(session, now);
    if (candidate) {
      this.report(session, candidate);
      return;
    }

    if (
      session.endedAt === null &&
      (FreezeDetector.isLongFrozen(session, now) ||
        flag === "not-a-flag" ||
        flag === "unclear")
    ) {
      session.endedAt = now;
      GameEndDebug.log(
        "freeze",
        `#${session.id} ended, result unknown (${flag}), waiting for the page`,
        { turnIndicator: GameEndPage.readTurnIndicator() }
      );
    }
  }

  private static isShownInMovesTable(session: LiveGameSession): boolean {
    const pgn = GameEndPage.readLivePgn();

    return (
      pgn.length === session.plies && GameEndRules.isContinuation(session.pgn, pgn)
    );
  }

  /** the engine to move searches again: a provisional end was wrong */
  private static retractIfEngineActive(session: LiveGameSession): void {
    const changedAt = session.box.changedAt;
    if (changedAt === null) {
      return;
    }

    if (session.endedAt !== null && changedAt > session.endedAt) {
      session.endedAt = null;
    }

    if (
      session.shown?.confidence === "provisional" &&
      changedAt > session.shownAt
    ) {
      this.refuteShownResult(session, Date.now(), "the engine to move searches");
    }
  }

  // * =========================
  // * websocket messages (inject/index.js)

  private static onPageMessage(message: PageSocketMessage): void {
    if (message.type === "result") {
      this.onSocketResult(message);
    } else if (!message.live) {
      this.onFinalGameUpdate(message);
    }
  }

  /** CCC's `result`, ~0.2 s after the last move (no game number) */
  private static onSocketResult(
    message: Extract<PageSocketMessage, { type: "result" }>
  ): void {
    // the final move may still wait for the settle timer
    this.flushMovesTable();

    const session = this.session ?? this.suspended;

    if (!session || session.state === "ended") {
      GameEndDebug.log("socket", "result without a live game");
      return;
    }
    if (!GameEndRules.socketResultMatches(message, session.watchedGame())) {
      GameEndDebug.log(
        "socket",
        `result of ${message.whiteName} - ${message.blackName}, not the watched game`
      );
      return;
    }

    this.report(session, PageSocketDetector.resultCandidate(message));
  }

  /** a finished game's update: the live game's, or an archived one opened */
  private static onFinalGameUpdate(
    message: Extract<PageSocketMessage, { type: "gameUpdate" }>
  ): void {
    if (GameEndPage.isArchiveView()) {
      GameEndDebug.log("socket", `archived game ${message.gameNr} opened`);
      return;
    }

    const candidate = PageSocketDetector.finalUpdateCandidate(message);
    if (!candidate) {
      return;
    }

    const liveGameNrs = PageSocketDetector.recentLiveGameNrs;
    const sessions = [this.session, this.lastEnded].filter(
      (s): s is LiveGameSession => s !== null && s.movesSeen > 0
    );
    const target = sessions.find(
      (s) =>
        !GameEndRules.finalUpdateMismatch(message, s.watchedGame(), liveGameNrs)
    );

    if (!target) {
      GameEndDebug.log("socket", `game ${message.gameNr} is not a watched game`);
      return;
    }

    this.report(target, candidate);
  }

  // * =========================
  // * results

  /** an end a rule explains: shown once the freeze rule confirms it */
  private static propose(
    session: LiveGameSession,
    candidate: GameEndCandidate
  ): void {
    if (session.pendingEnd || session.hasStandingResult) {
      return;
    }

    session.pendingEnd = candidate;
    GameEndDebug.log(
      "freeze",
      `#${session.id} ${candidate.source} at ply ${session.plies}: waiting for the engines to stay idle`
    );
  }

  /** the game went on after the result shown: it was wrong */
  private static refuteShownResult(
    session: LiveGameSession,
    now: number,
    why: string
  ): void {
    const shown = session.shown;

    if (!shown || shown.refuted) {
      return;
    }

    // CCC's result may come before the final move is rendered
    if (
      shown.source === "page-socket" &&
      now - session.shownAt < GameEndConfig.SOCKET_RESULT_GRACE_MS
    ) {
      return;
    }

    session.shown = { ...shown, refuted: true };
    GameEndDebug.log(
      "arbiter",
      `#${session.id} ${why} after the ${shown.confidence} ${shown.source} result ${shown.outcome}`
    );
  }

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

    session.shownAt = Date.now();

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

    // the schedule may already show the next game in progress
    if (
      live?.gameNumber &&
      GameEndRules.namesMatch(live.white, session.names.white) &&
      GameEndRules.namesMatch(live.black, session.names.black)
    ) {
      session.gameNumber = live.gameNumber;
      GameEndDebug.log("session", `#${session.id} is game ${live.gameNumber}`);
    }
  }
}
