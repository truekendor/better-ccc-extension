/**
 * Live game end detection, part 1 of 4: shared types, tunable constants
 * and the pure logic used by the detectors.
 *
 * Nothing here touches the page or another script's globals, so this file
 * can be loaded alone in a test runner (see GameEndRules).
 *
 * Load order (manifest.json):
 *   gameEnd/gameEndLogic.js     types, GameEndConfig, GameEndRules, GameEndArbiter
 *   gameEnd/gameEndPage.js      everything read from the page, debug log
 *   gameEnd/gameEndDetectors.js the detectors
 *   gameEnd/gameEndWatcher.js   live game session tracking, feeds the detectors
 *   gameResultToast.js          toast + chime, starts everything
 * and inject/index.js, injected into the page by highlightDeviation.js,
 * forwards the CCC websocket results (see PageSocketDetector)
 */

type GameOutcome = "white" | "black" | "draw";

type EngineColor = "white" | "black";

/**
 * how much a detector trusts its result:
 * - certain: the server said so, or decided on the board (mate, draw by rule)
 * - provisional: inferred from the page (CCC's adjudication rules, clocks)
 * - confirmed: the official result shown by the page later (schedule,
 *   result box, final game update)
 */
type GameEndConfidence = "certain" | "provisional" | "confirmed";

type GameEndSource =
  | "page-socket"
  | "board"
  | "tablebase"
  | "eval-draw"
  | "time-forfeit"
  | "page-result"
  | "schedule";

/** what a detector thinks the result of the watched game is */
type GameEndCandidate = {
  outcome: GameOutcome;
  /** first part of the toast's second line: "Checkmate", "Game 467"... */
  reason: string;
  confidence: GameEndConfidence;
  source: GameEndSource;
  /** full moves, when the detector knows better than the watched moves */
  moveCount?: number;
  /** engine names, when the detector knows better than the engine panels */
  white?: string;
  black?: string;
};

/** an eval as displayed by CCC: "+0.77", "+ 82.50", "-0.00", "+M8", "-M5" */
type ParsedEval = {
  /** signed value as displayed, ±MATE_PAWNS for mate scores */
  pawns: number;
  /** moves to mate as displayed (signed), null for a normal score */
  mateIn: number | null;
};

type EvalPointOfView = "white" | "engine";

/** what the side to move's engine did since the last ply */
type FreezeInput = {
  now: number;
  /** when the last ply appeared (or the stats box became readable) */
  since: number | null;
  /** the side to move's stats box is displayed */
  boxKnown: boolean;
  /** last change of that box since the ply, null if it never changed */
  changedAt: number | null;
};

/**
 * - unknown: the stats box isn't displayed
 * - active: the side to move started searching, the game goes on
 * - waiting: no change yet, too early to tell
 * - frozen: no change for the whole delay, the game is over
 */
type FreezeState = "unknown" | "active" | "waiting" | "frozen";

type FlagInput = FreezeInput & {
  /** when the side to move runs out of time, null if unknown */
  flagAt: number | null;
};

/**
 * - not-yet: the side to move still has time (or keeps searching)
 * - time-forfeit: it searched until its clock ran out
 * - not-a-flag: its engine had stopped well before: the game ended
 *   otherwise (the page keeps counting down after any end)
 * - unclear: can't tell
 */
type FlagState = "not-yet" | "time-forfeit" | "not-a-flag" | "unclear";

/** one ply for the eval draw rule */
type EvalDrawPly = {
  san: string;
  /** the mover's score when its ply appeared, null if unknown */
  score: number | null;
};

/** messages forwarded by inject/index.js from the CCC websocket */
type PageSocketMessage =
  | {
      type: "result";
      whiteName: string;
      blackName: string;
      outcome: GameOutcome;
      /** cutechess reason: "Draw by adjudication: SyzygyTB" */
      reason: string;
    }
  | {
      type: "gameUpdate";
      /** server game id (not the schedule number) */
      gameNr: string;
      /** true at the start of a game, false for a finished one */
      live: boolean;
      /** "drawSyzygy", "whiteMates"... empty while live */
      termination: string;
      outcome: GameOutcome | null;
      white: string;
      black: string;
      plyCount: number | null;
    };

/** result box of the moves table, or the engine panels' colors */
type PageResult = {
  outcome: GameOutcome;
  reason: string;
};

/** one row of the schedule */
type ScheduleRowInfo = {
  gameNumber: string;
  white: string;
  black: string;
  /** null while the game is in progress or not played yet */
  outcome: GameOutcome | null;
  /** "86 Moves" = full moves */
  moveCount: number | null;
  inProgress: boolean;
};

type FinishedScheduleRow = ScheduleRowInfo & { outcome: GameOutcome };

/** what is known about the watched game to recognize it elsewhere */
type WatchedGame = {
  plies: number;
  white: string;
  black: string;
  /** schedule number, if the game was seen "in progress" there */
  gameNumber: string | null;
};

type SchedulePick =
  | { status: "found"; row: FinishedScheduleRow }
  /** the schedule doesn't show the result yet: try again later */
  | { status: "pending"; why: string }
  /** the schedule shows another game's result: give up */
  | { status: "rejected"; why: string };

/** result shown for a game, as remembered by the arbiter */
type ShownResult = {
  outcome: GameOutcome;
  confidence: GameEndConfidence;
  source: GameEndSource;
  /** moves (or engine activity) came after it: the game went on, it was wrong */
  refuted: boolean;
};

type ArbiterDecision = {
  notify: boolean;
  /** the toast replaces a different result shown before */
  corrected: boolean;
  /** what the game's shown result becomes */
  next: ShownResult | null;
  /** for the debug log */
  why: string;
};

/**
 * every tunable threshold of the game end detection, in one place
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndConfig {
  // * =========================
  // * live game tracking

  /** a replaced game is reported if it was watched at least this long */
  static readonly MIN_WATCH_TIME_MS = 5000;
  /** shorter games are not reported (book moves are loaded at once) */
  static readonly MIN_PLIES = 10;
  /** moves table mutations come in bursts, wait for the table to settle */
  static readonly SETTLE_DELAY_MS = 400;
  /** how often the clocks / engine stats are checked */
  static readonly TICK_MS = 500;
  /** per-ply snapshots (taken when a ply appears) kept for the session */
  static readonly PLY_SNAPSHOTS_KEPT = 40;

  // * =========================
  // * page websocket (certain)

  /** `source` of the window messages posted by inject/index.js */
  static readonly PAGE_MESSAGE_SOURCE = "better-ccc-page";
  /**
   * CCC's `result` may arrive before the final move is rendered: a ply
   * this soon after it doesn't refute it
   */
  static readonly SOCKET_RESULT_GRACE_MS = 3000;

  // * =========================
  // * freeze rule: the side to move's stats box (Depth, Nodes, Speed,
  // * TB Hits) changes within 0.5 s of every ply during play and never
  // * after the final one

  /** an end explained by a rule (tablebase, eval draw) is confirmed after this */
  static readonly FREEZE_MS = 1500;
  /** same, for a background tab (throttled timers, late renders) */
  static readonly FREEZE_HIDDEN_MS = 2000;
  /**
   * an end nothing explains: "ended, result unknown" after this (an engine
   * printed no info for up to 5.4 s before moving), no toast
   */
  static readonly UNEXPLAINED_FREEZE_MS = 6000;

  // * =========================
  // * CCC adjudication rules (provisional, confirmed by the freeze rule)

  /** CCC adjudicates drawn 6-man Syzygy positions at once (Info tab) */
  static readonly TB_MAX_PIECES = 6;
  static readonly TABLEBASE_URL = "https://tablebase.lichess.ovh/standard?fen=";
  /** fen -> is a draw, entries kept */
  static readonly TABLEBASE_CACHE_SIZE = 500;
  /**
   * eval draw (cutechess `-draw movenumber=50 movecount=10 score=10`, fits
   * all 1,244 archived CCC 26 games): both engines within ±EVAL_DRAW_MAX
   * for EVAL_DRAW_PLIES plies in a row from fullmove EVAL_DRAW_MIN_FULLMOVE
   */
  static readonly EVAL_DRAW_MAX = 0.1;
  static readonly EVAL_DRAW_PLIES = 20;
  static readonly EVAL_DRAW_MIN_FULLMOVE = 50;

  // * =========================
  // * time forfeit (provisional)

  /**
   * no move this long after the side to move's clock ran out (the server
   * allows 1 s) = loss on time; its remaining time is read right after the
   * last move
   */
  static readonly OVERTIME_GRACE_MS = 1500;
  /**
   * engine output seen up to this long after the flag time still belongs
   * to the search before it (tick resolution, network, and the clock shows
   * whole seconds from 6 s up: "0:06" was 6.65 s); output later than that
   * means the clock reading was wrong
   */
  static readonly STATS_LATENCY_MS = 1500;
  /**
   * the side to move's clock is read again this long after the move: if it
   * didn't drop, it is not the clock counting down (the display only
   * changes once a second)
   */
  static readonly CLOCK_RUNNING_CHECK_MS = 2500;
  /** flag: the side to move's stats changed at most this long before it */
  static readonly FLAG_ACTIVE_WINDOW_MS = 1000;
  /** not a flag: the stats were already frozen this long before it */
  static readonly FLAG_FROZEN_BEFORE_MS = 1500;

  // * =========================
  // * confirmation: schedule

  /** how long to wait for the schedule to show the result */
  static readonly RESULT_TIMEOUT_MS = 10_000;
  static readonly SCHEDULE_RETRY_MS = 1000;
  /** the schedule tab is opened for at most POLLS * POLL_MS (wall clock) */
  static readonly SCHEDULE_PEEK_POLLS = 10;
  static readonly SCHEDULE_PEEK_POLL_MS = 50;
  /** times the tab is opened while waiting for a replaced game's result */
  static readonly SCHEDULE_MAX_PEEKS = 3;
  /** schedule move count vs watched moves */
  static readonly MOVE_COUNT_TOLERANCE = 1;
  /**
   * end of an event (no next game): look for the watched game among the
   * last finished rows this long after an unexplained end, or after this
   * long without a move while the engines are idle
   */
  static readonly EVENT_END_AFTER_END_MS = 15_000;
  static readonly EVENT_END_STALL_MS = 45_000;
  static readonly EVENT_END_RETRY_MS = 30_000;
  static readonly EVENT_END_MAX_CHECKS = 5;
  /**
   * finished rows looked at from the end: only the latest, the game two
   * rows up is the pair game with the same engines and colors
   */
  static readonly EVENT_END_SCAN_ROWS = 1;

  // * =========================
  // * dev

  /** `localStorage.setItem("better-ccc-debug-gameend", "1")` logs decisions */
  static readonly DEBUG_STORAGE_KEY = "better-ccc-debug-gameend";
}

/**
 * how the evals shown by CCC are signed: every live eval (engine panels,
 * stats boxes) is from white's point of view, the server negates Black's
 * own score. Only the eval draw rule uses evals, and only their size:
 * decisive games are played to mate in CCC 26 (no win adjudication in
 * 1,244 archived games), so a winner is never guessed from evals
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class EvalConvention {
  static readonly POINT_OF_VIEW: EvalPointOfView = "white";

  /** eval of the engine playing `color`, from white's point of view */
  static toWhitePov(color: EngineColor, displayed: ParsedEval): number {
    if (this.POINT_OF_VIEW === "engine" && color === "black") {
      return -displayed.pawns;
    }
    return displayed.pawns;
  }
}

/**
 * pure functions of the game end detection: parsing what the page shows
 * and the decisions made from it.
 *
 * Unit tests: load the compiled `src/gameEnd/gameEndLogic.js` alone, e.g.
 * `vm.runInContext(code + ";({ GameEndRules, GameEndArbiter, GameEndConfig })", ctx)`
 * (only `readScheduleRow` needs an Element, a fake one with
 * `children` / `tagName` / `textContent` / `classList` is enough)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndRules {
  /** value used for mate scores */
  static readonly MATE_PAWNS = 1000;

  // * =========================
  // * moves

  /** true if `next` is `prev` plus the moves played since */
  static isContinuation(prev: readonly string[], next: readonly string[]): boolean {
    if (next.length < prev.length) {
      return false;
    }

    return prev.every((move, index) => next[index] === move);
  }

  /**
   * the moves table now shows another, shorter game: the next game
   * started (pre-filled with its book moves). Games watched too briefly
   * may just be the page settling at load
   */
  static isNextGame(
    previous: { plies: number; watchedMs: number },
    nextPlies: number,
    minPlies = GameEndConfig.MIN_PLIES,
    minWatchMs = GameEndConfig.MIN_WATCH_TIME_MS
  ): boolean {
    return (
      previous.plies >= minPlies &&
      nextPlies < previous.plies &&
      previous.watchedMs >= minWatchMs
    );
  }

  /** side to move after `plies` half moves from the initial position */
  static sideToMove(plies: number): EngineColor {
    return plies % 2 === 0 ? "white" : "black";
  }

  /** who played ply number `ply` (1 = white's first move) */
  static moverOfPly(ply: number): EngineColor {
    return ply % 2 === 1 ? "white" : "black";
  }

  /** side to move written in a FEN, null if unreadable */
  static sideToMoveFromFen(fen: string | null): EngineColor | null {
    const field = fen?.split(" ")[1];

    if (field === "w") return "white";
    if (field === "b") return "black";
    return null;
  }

  static opponent(color: EngineColor): EngineColor {
    return color === "white" ? "black" : "white";
  }

  static fullMoves(plies: number): number {
    return Math.ceil(plies / 2);
  }

  /** "Qxf7#" */
  static isMateSan(san: string): boolean {
    return san.includes("#");
  }

  /** "exd5", "Nxe4", "e4", "e8=Q": the 50-move counter restarts */
  static isCaptureOrPawnMove(san: string): boolean {
    return san.includes("x") || /^[a-h]/.test(san);
  }

  // * =========================
  // * position

  static countPieces(fen: string): number {
    return (fen.split(" ")[0] ?? "").replace(/[^a-zA-Z]/g, "").length;
  }

  /** false when `color` only has a king, or a king and one minor piece */
  static hasMatingMaterial(fen: string, color: EngineColor): boolean {
    const board = fen.split(" ")[0] ?? "";
    const pieces = Array.from(board.replace(/[^a-zA-Z]/g, ""));
    const own = pieces.filter((piece) =>
      color === "white"
        ? piece === piece.toUpperCase()
        : piece === piece.toLowerCase()
    );
    const nonKing = own.filter((piece) => piece.toLowerCase() !== "k");

    if (nonKing.length === 0) {
      return false;
    }

    return !(nonKing.length === 1 && /[bn]/i.test(nonKing[0]!));
  }

  /**
   * worth a tablebase lookup: a capture that leaves `maxPieces` men or less
   * (all 191 archived Syzygy draws were adjudicated on such a capture,
   * won positions are played to mate)
   */
  static isTablebaseCandidate(
    san: string,
    fen: string,
    maxPieces = GameEndConfig.TB_MAX_PIECES
  ): boolean {
    return san.includes("x") && this.countPieces(fen) <= maxPieces;
  }

  /** lichess tablebase category; cursed wins / blessed losses are draws (50-move rule) */
  static isTablebaseDraw(category: string | undefined): boolean {
    return (
      category === "draw" ||
      category === "cursed-win" ||
      category === "blessed-loss"
    );
  }

  /**
   * `flagged` ran out of time: the opponent wins,
   * or it is a draw if the opponent can't mate
   */
  static timeForfeitOutcome(fen: string | null, flagged: EngineColor): GameOutcome {
    const winner = this.opponent(flagged);

    if (fen && !this.hasMatingMaterial(fen, winner)) {
      return "draw";
    }

    return winner;
  }

  // * =========================
  // * clocks

  /**
   * remaining time shown on an engine panel: "3:02", "0:23", "0:02.11",
   * "1:02:03". Empty (CCC clears it at zero) or unreadable = null (unknown)
   */
  static parseClockSeconds(text: string | null | undefined): number | null {
    const match = text?.match(/(-)?((?:\d+:)?\d+:\d{2}(?:\.\d+)?)/);
    if (!match) {
      return null;
    }

    const seconds = match[2]!
      .split(":")
      .reduce((total, part) => total * 60 + parseFloat(part), 0);

    return match[1] ? -seconds : seconds;
  }

  /**
   * when the side to move runs out of time, from its clock read at `readAt`.
   * The display keeps the value of the move for a second, then drops by
   * one second each second: read within that first second, the time left
   * counts from the move (`movedAt`), otherwise from the reading (up to
   * a second late, the safe side)
   */
  static flagTime(seconds: number, readAt: number, movedAt?: number): number {
    const from =
      movedAt !== undefined && readAt >= movedAt && readAt - movedAt < 1000
        ? movedAt
        : readAt;

    return from + seconds * 1000;
  }

  /**
   * a second reading of the side to move's clock, CLOCK_RUNNING_CHECK_MS
   * later, shows it is not running. The display changes once a second and
   * truncates from 6 s up ("0:06" -> "0:05.65"), so only "no drop at all"
   * counts
   */
  static isClockStopped(first: number, second: number | null): boolean {
    if (second === null) {
      // cleared at zero: it was running
      return false;
    }

    return second >= first;
  }

  // * =========================
  // * evals and engine stats

  /**
   * "+0.77", "+ 0.01", "-0.00", "200.00", "+M8", "-M5", "M13", "#-3".
   * null for anything else (clock, "13/50", empty)
   */
  static parseEval(text: string | null | undefined): ParsedEval | null {
    if (!text) {
      return null;
    }

    const value = text.replace(/−/g, "-").replace(/\s+/g, "");

    const mate = value.match(/^([+-]?)(?:M|#)([+-]?)(\d+)$/i);
    if (mate) {
      const negative = (mate[1] === "-") !== (mate[2] === "-");
      const moves = parseInt(mate[3]!, 10);

      return {
        pawns: negative ? -this.MATE_PAWNS : this.MATE_PAWNS,
        mateIn: negative ? -moves : moves,
      };
    }

    if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
      return { pawns: parseFloat(value), mateIn: null };
    }

    return null;
  }

  /**
   * what changes in a stats box of `#graph-valuebar` while its engine
   * searches. Its six spans: Eval, Depth, Nodes, Time, Speed, TB Hits.
   * Left out: Time (the engine's clock after its last move, it changes with
   * moves) and Eval (rebuilt from the PGN once the game is over: "-0.00"
   * becomes "+0.00"); every search line changes the node count anyway
   */
  static valueBoxSignature(spans: readonly string[]): string {
    return [1, 2, 4, 5].map((index) => (spans[index] ?? "").trim()).join("|");
  }

  // * =========================
  // * CCC rules

  /**
   * eval draw counter after one more ply (cutechess): +1 while the mover's
   * score is within ±maxAbs, 0 otherwise; a capture or pawn move restarts
   * it (at 1 if within). An unknown score (or a book move) restarts it at 0
   */
  static nextEvalDrawCount(
    count: number,
    ply: EvalDrawPly,
    maxAbs = GameEndConfig.EVAL_DRAW_MAX
  ): number {
    if (ply.score === null) {
      return 0;
    }

    // scores have two decimals, ±0.10 itself counts
    if (Math.abs(ply.score) > maxAbs + 1e-9) {
      return 0;
    }

    return this.isCaptureOrPawnMove(ply.san) ? 1 : count + 1;
  }

  /** the eval draw rule fires on the ply that brings the game to `plies` */
  static isEvalDrawReached(
    count: number,
    plies: number,
    needed = GameEndConfig.EVAL_DRAW_PLIES,
    minFullMove = GameEndConfig.EVAL_DRAW_MIN_FULLMOVE
  ): boolean {
    return count >= needed && Math.floor(plies / 2) >= minFullMove;
  }

  // * =========================
  // * game over

  /**
   * has the side to move's engine shown any activity since the last ply?
   * During play its stats box changes within 0.5 s; after the final ply it
   * never changes
   */
  static freezeState(
    input: FreezeInput,
    freezeMs = GameEndConfig.FREEZE_MS
  ): FreezeState {
    if (!input.boxKnown || input.since === null) {
      return "unknown";
    }
    if (input.changedAt !== null) {
      return "active";
    }

    return input.now - input.since >= freezeMs ? "frozen" : "waiting";
  }

  /**
   * did the side to move lose on time? Its clock ran out OVERTIME_GRACE_MS
   * ago with no move, and its engine searched right until then (the page
   * keeps counting down after any game end, so an engine that had stopped
   * well before means the game ended otherwise)
   */
  static classifyFlag(
    input: FlagInput,
    cfg: Pick<
      typeof GameEndConfig,
      | "OVERTIME_GRACE_MS"
      | "STATS_LATENCY_MS"
      | "FLAG_ACTIVE_WINDOW_MS"
      | "FLAG_FROZEN_BEFORE_MS"
    > = GameEndConfig
  ): FlagState {
    const { now, flagAt, boxKnown, changedAt } = input;

    if (flagAt === null || now < flagAt + cfg.OVERTIME_GRACE_MS) {
      return "not-yet";
    }
    if (!boxKnown) {
      return "unclear";
    }
    if (changedAt === null) {
      // never searched after the last ply: the game ended with it
      return "not-a-flag";
    }
    if (changedAt > flagAt + cfg.STATS_LATENCY_MS) {
      // still searching after its flag time: the clock reading was wrong
      return "not-yet";
    }

    const quietBeforeFlagMs = flagAt - changedAt;

    if (quietBeforeFlagMs <= cfg.FLAG_ACTIVE_WINDOW_MS) {
      return "time-forfeit";
    }
    if (quietBeforeFlagMs >= cfg.FLAG_FROZEN_BEFORE_MS) {
      return "not-a-flag";
    }

    return "unclear";
  }

  /**
   * the event may be over (no next game replaces the watched one):
   * a while after an unexplained end, or after a long time without a move
   * while the side to move's engine is idle
   */
  static isEventEndSuspected(
    input: {
      now: number;
      lastMoveAt: number;
      endedAt: number | null;
      freeze: FreezeState;
    },
    afterEndMs = GameEndConfig.EVENT_END_AFTER_END_MS,
    stallMs = GameEndConfig.EVENT_END_STALL_MS
  ): boolean {
    if (input.endedAt !== null) {
      return input.now - input.endedAt >= afterEndMs;
    }
    if (input.freeze === "active") {
      return false;
    }

    return input.now - input.lastMoveAt >= stallMs;
  }

  // * =========================
  // * results shown by the page

  /** "1-0" / "0-1" / "1/2-1/2" / "½-½" (the first word) */
  static parseScore(text: string): GameOutcome | null {
    const score = text.trim().split(/\s+/)[0] ?? "";

    if (score === "1-0") return "white";
    if (score === "0-1") return "black";
    if (score.startsWith("1/2") || score.startsWith("½")) return "draw";
    return null;
  }

  /** cutechess reason of a websocket `result` -> toast label */
  static socketReasonLabel(reason: string, outcome: GameOutcome): string {
    const labels: readonly [RegExp, string][] = [
      [/syzygy|tablebase/i, outcome === "draw" ? "Tablebase draw" : "Tablebase win"],
      [/mates/i, "Checkmate"],
      [/adjudication/i, "Adjudication"],
      [/3-fold|threefold|repetition/i, "Repetition"],
      [/fifty|50.move/i, "50-move rule"],
      [/stalemate/i, "Stalemate"],
      [/insufficient/i, "Insufficient material"],
      [/on time|time forfeit|timeout/i, "Time forfeit"],
      [/disconnect/i, "Disconnection"],
      [/stall/i, "Connection stall"],
      [/illegal/i, "Illegal move"],
      [/resign/i, "Resignation"],
    ];

    const label = labels.find(([pattern]) => pattern.test(reason))?.[1];

    return label ?? reason.trim().slice(0, 60);
  }

  /** CCC termination code of a finished game -> toast label */
  static terminationLabel(code: string): string {
    const labels: Record<string, string> = {
      whiteMates: "Checkmate",
      blackMates: "Checkmate",
      whiteAdjWin: "Adjudication",
      blackAdjWin: "Adjudication",
      drawAdj: "Adjudication",
      drawSyzygy: "Tablebase draw",
      draw3Fold: "Repetition",
      draw50Move: "50-move rule",
      drawStalemate: "Stalemate",
      drawInsuff: "Insufficient material",
      whiteTimeout: "Time forfeit",
      blackTimeout: "Time forfeit",
      whiteDc: "Disconnection",
      blackDc: "Disconnection",
      whiteStall: "Connection stall",
      blackStall: "Connection stall",
      whiteIllegal: "Illegal move",
      blackIllegal: "Illegal move",
      error: "Error",
    };

    return labels[code] ?? code;
  }

  /** label of the moves table result box ("Syzygy Adjudication") -> toast label */
  static pageResultLabel(label: string): string {
    const labels: Record<string, string> = {
      "syzygy adjudication": "Tablebase draw",
      "50 moves": "50-move rule",
      "insufficient material": "Insufficient material",
      timeout: "Time forfeit",
      "connection stall": "Connection stall",
    };
    const text = label.replace(/\s+/g, " ").trim();

    return labels[text.toLowerCase()] ?? text;
  }

  /**
   * result box of the moves table: `.movetable-gameResult.movetable-draw`,
   * text "Draw 1/2 - 1/2 Syzygy Adjudication" (or "White Won 1 - 0 ...")
   */
  static parsePageResult(classes: readonly string[], text: string): PageResult | null {
    let outcome: GameOutcome | null = null;

    if (classes.includes("movetable-white")) outcome = "white";
    else if (classes.includes("movetable-black")) outcome = "black";
    else if (classes.includes("movetable-draw")) outcome = "draw";

    if (!outcome) {
      return null;
    }

    const label = text
      .replace(/\s+/g, " ")
      .replace(/^.*?(?:1\/2\s*-\s*1\/2|½\s*-\s*½|1\s*-\s*0|0\s*-\s*1)\s*/, "");

    return { outcome, reason: this.pageResultLabel(label) };
  }

  /** classes of the white engine panel: `enginedata-win|loss|draw` */
  static outcomeFromPanelClasses(whiteClasses: readonly string[]): GameOutcome | null {
    if (whiteClasses.includes("enginedata-win")) return "white";
    if (whiteClasses.includes("enginedata-loss")) return "black";
    if (whiteClasses.includes("enginedata-draw")) return "draw";
    return null;
  }

  /**
   * validates a window message from inject/index.js:
   * `{ source: "better-ccc-page", type, json: JSON string of the payload }`
   */
  static parsePageMessage(
    data: unknown,
    source = GameEndConfig.PAGE_MESSAGE_SOURCE
  ): PageSocketMessage | null {
    if (!data || typeof data !== "object") {
      return null;
    }

    const { source: tag, type, json } = data as Record<string, unknown>;
    if (tag !== source || typeof type !== "string" || typeof json !== "string") {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      return null;
    }
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const fields = payload as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === "string"
        ? value.trim()
        : typeof value === "number"
        ? String(value)
        : "";

    if (type === "result") {
      const outcome = this.parseScore(text(fields.score));
      if (!outcome) {
        return null;
      }

      return {
        type,
        whiteName: text(fields.whiteName),
        blackName: text(fields.blackName),
        outcome,
        reason: text(fields.reason),
      };
    }

    if (type === "gameUpdate") {
      const gameNr = text(fields.gameNr);
      if (!gameNr) {
        return null;
      }

      const plyCount =
        typeof fields.plyCount === "number" && Number.isFinite(fields.plyCount)
          ? fields.plyCount
          : null;

      return {
        type,
        gameNr,
        live: fields.live === true,
        termination: text(fields.termination),
        outcome: this.parseScore(text(fields.outcome)),
        white: text(fields.white),
        black: text(fields.black),
        plyCount,
      };
    }

    return null;
  }

  /** a websocket `result` (no game number) belongs to the watched game */
  static socketResultMatches(
    message: { whiteName: string; blackName: string },
    watched: WatchedGame
  ): boolean {
    return (
      this.namesMatch(message.whiteName, watched.white) &&
      this.namesMatch(message.blackName, watched.black)
    );
  }

  /**
   * a finished game's update belongs to the watched game: one of the last
   * live games' server numbers when known (an archived game opened by the
   * user has another one), and the same engines and length
   */
  static finalUpdateMismatch(
    message: { gameNr: string; white: string; black: string; plyCount: number | null },
    watched: WatchedGame,
    liveGameNrs: readonly string[],
    tolerance = GameEndConfig.MOVE_COUNT_TOLERANCE
  ): string | null {
    if (liveGameNrs.length > 0 && !liveGameNrs.includes(message.gameNr)) {
      return `game ${message.gameNr} is not a live game (${liveGameNrs.join(", ")})`;
    }
    if (
      !this.namesMatch(message.white, watched.white) ||
      !this.namesMatch(message.black, watched.black)
    ) {
      return `game ${message.gameNr} is ${message.white} - ${message.black}`;
    }
    if (
      message.plyCount !== null &&
      Math.abs(message.plyCount - watched.plies) > tolerance * 2
    ) {
      return `game ${message.gameNr} has ${message.plyCount} plies, the watched game ${watched.plies}`;
    }

    return null;
  }

  // * =========================
  // * schedule

  /** "#1 Torch" -> "Torch" */
  static cleanScheduleName(text: string): string {
    return text.replace(/^\s*#\d+\s*/, "").trim();
  }

  /**
   * texts of the <div> cells of a schedule row:
   *   ["467", "#1 Torch", "1-0 \n 86 Moves", "#2 Reckless"]
   * (the first engine plays white)
   */
  static parseScheduleCells(
    cells: readonly string[],
    inProgress: boolean
  ): ScheduleRowInfo | null {
    const [indexText, whiteText, scoreText, blackText] = cells;

    if (
      indexText === undefined ||
      whiteText === undefined ||
      scoreText === undefined ||
      blackText === undefined
    ) {
      return null;
    }

    const moves = scoreText.match(/(\d+)\s*Moves?/i)?.[1];

    return {
      gameNumber: indexText.trim(),
      white: this.cleanScheduleName(whiteText),
      black: this.cleanScheduleName(blackText),
      outcome: inProgress ? null : this.parseScore(scoreText),
      moveCount: moves ? parseInt(moves, 10) : null,
      inProgress,
    };
  }

  /**
   * schedule row (`.schedule-game-link`):
   *   <div.schedule-index>467</div> <img> <div.win>#1 Torch</div>
   *   <div>1-0  86 Moves</div> <div.loss>#2 Reckless</div> <img>
   * the live game's row has the `schedule-in-progress` class
   */
  static readScheduleRow(row: Element): ScheduleRowInfo | null {
    const cells = Array.from(row.children)
      .filter((el) => el.tagName === "DIV")
      .map((el) => el.textContent ?? "");
    const inProgress =
      row.classList.contains("schedule-in-progress") ||
      !!row.querySelector?.(".schedule-in-progress");

    return this.parseScheduleCells(cells, inProgress);
  }

  /** "86 Moves" vs the plies watched, which may miss the last one */
  static moveCountMatches(
    scheduleMoves: number | null,
    watchedPlies: number,
    tolerance = GameEndConfig.MOVE_COUNT_TOLERANCE
  ): boolean {
    if (scheduleMoves === null) {
      return true;
    }

    return Math.abs(scheduleMoves - this.fullMoves(watchedPlies)) <= tolerance;
  }

  /** same engine; unknown names match anything */
  static namesMatch(a: string, b: string): boolean {
    const normalize = (name: string) =>
      name
        .replace(/^\s*#\d+\s*/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const left = normalize(a);
    const right = normalize(b);

    if (!left || !right) {
      return true;
    }

    return left === right || left.includes(right) || right.includes(left);
  }

  /** why a finished row is not the watched game, null if it is */
  static scheduleRowMismatch(
    row: ScheduleRowInfo,
    watched: WatchedGame,
    tolerance = GameEndConfig.MOVE_COUNT_TOLERANCE
  ): string | null {
    if (watched.gameNumber && row.gameNumber && row.gameNumber !== watched.gameNumber) {
      return `game ${row.gameNumber} is not the watched game ${watched.gameNumber}`;
    }
    if (!this.moveCountMatches(row.moveCount, watched.plies, tolerance)) {
      return `game ${row.gameNumber} has ${row.moveCount} moves, the watched game ${this.fullMoves(watched.plies)}`;
    }
    if (!this.namesMatch(row.white, watched.white) || !this.namesMatch(row.black, watched.black)) {
      return `game ${row.gameNumber} is ${row.white} - ${row.black}, the watched game ${watched.white} - ${watched.black}`;
    }

    return null;
  }

  /**
   * finds the finished row of the watched game among the schedule rows
   * (page order):
   * - "replaced" (the next game started): the row right before the
   *   in-progress one
   * - "event-end" (no next game came): only when no game is in progress,
   *   the watched game is then one of the last finished rows
   * The row must match the watched game (number, move count, names) so an
   * older game's result is never reported (crash replay, page reload...)
   */
  static pickFinishedRow(
    rows: readonly ScheduleRowInfo[],
    watched: WatchedGame,
    mode: "replaced" | "event-end",
    scanRows = GameEndConfig.EVENT_END_SCAN_ROWS,
    tolerance = GameEndConfig.MOVE_COUNT_TOLERANCE
  ): SchedulePick {
    const check = (row: ScheduleRowInfo | undefined): SchedulePick => {
      if (!row || !row.outcome) {
        return { status: "pending", why: "no result in the schedule yet" };
      }

      const mismatch = this.scheduleRowMismatch(row, watched, tolerance);

      return mismatch
        ? { status: "rejected", why: mismatch }
        : { status: "found", row: row as FinishedScheduleRow };
    };

    const liveIndex = rows.findIndex((row) => row.inProgress);

    if (liveIndex !== -1) {
      if (mode === "event-end") {
        return {
          status: "pending",
          why: "a game is in progress, waiting for it to replace the watched one",
        };
      }

      if (watched.gameNumber && rows[liveIndex]!.gameNumber === watched.gameNumber) {
        return { status: "pending", why: "the watched game is still in progress" };
      }
      if (liveIndex === 0) {
        return { status: "rejected", why: "no game before the one in progress" };
      }

      return check(rows[liveIndex - 1]);
    }

    // no game in progress: the event is over
    if (watched.gameNumber) {
      return check(rows.find((row) => row.gameNumber === watched.gameNumber));
    }

    const latestFinished = rows
      .filter((row) => row.outcome)
      .slice(-scanRows)
      .reverse();
    const match = latestFinished.find(
      (row) => !this.scheduleRowMismatch(row, watched, tolerance)
    );

    return match
      ? { status: "found", row: match as FinishedScheduleRow }
      : { status: "pending", why: "none of the last finished games is the watched one" };
  }

  // * =========================
  // * toast text

  /** "Corrected result · Game 467 · 86 moves" */
  static formatReason(
    reason: string,
    moveCount: number | null,
    corrected: boolean
  ): string {
    return [
      corrected && "Corrected result",
      reason,
      moveCount && `${moveCount} moves`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
}

/**
 * decides whether a detector's result is shown, so each game gets one toast:
 * - the first result is shown
 * - a certain / confirmed result is final, later ones are ignored
 * - a provisional result is followed by nothing if a certain / confirmed
 *   one agrees, or by a "Corrected result" toast if it disagrees
 * - one provisional result per game
 * - a result refuted by later moves doesn't count anymore, and its
 *   detector isn't trusted again for that game (a drawn position CCC
 *   doesn't adjudicate would toast after every move)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndArbiter {
  static decide(
    shown: ShownResult | null,
    candidate: GameEndCandidate
  ): ArbiterDecision {
    const asShown: ShownResult = {
      outcome: candidate.outcome,
      confidence: candidate.confidence,
      source: candidate.source,
      refuted: false,
    };

    if (!shown) {
      return { notify: true, corrected: false, next: asShown, why: "first result" };
    }

    if (shown.refuted && shown.source === candidate.source) {
      return {
        notify: false,
        corrected: false,
        next: shown,
        why: `the ${candidate.source} result was refuted earlier in this game`,
      };
    }

    if (shown.refuted) {
      return {
        notify: true,
        corrected: shown.outcome !== candidate.outcome,
        next: asShown,
        why: "the game went on after the previous result",
      };
    }

    if (shown.confidence !== "provisional") {
      return {
        notify: false,
        corrected: false,
        next: shown,
        why: `a ${shown.confidence} result was already shown`,
      };
    }

    if (candidate.confidence === "provisional") {
      return {
        notify: false,
        corrected: false,
        next: shown,
        why: "a provisional result was already shown",
      };
    }

    if (candidate.outcome === shown.outcome) {
      return {
        notify: false,
        corrected: false,
        next: { ...shown, confidence: candidate.confidence },
        why: "the provisional result was right",
      };
    }

    return {
      notify: true,
      corrected: true,
      next: asShown,
      why: "the provisional result was wrong",
    };
  }
}
