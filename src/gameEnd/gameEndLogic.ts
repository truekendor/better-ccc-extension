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
 */

type GameOutcome = "white" | "black" | "draw";

type EngineColor = "white" | "black";

/**
 * how much a detector trusts its result:
 * - certain: decided on the board (mate, draw by rule, tablebase draw)
 * - provisional: guessed from the page (clocks, frozen engine output, evals)
 * - confirmed: read from the schedule, the official result
 */
type GameEndConfidence = "certain" | "provisional" | "confirmed";

type GameEndSource =
  | "board"
  | "tablebase"
  | "time-forfeit"
  | "adjudication"
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

/** an eval as displayed by CCC: "+0.77", "+ 82.50", "+M8", "-M5", "200.00" */
type ParsedEval = {
  /** signed value as displayed, ±MATE_PAWNS for mate scores */
  pawns: number;
  /** moves to mate as displayed (signed), null for a normal score */
  mateIn: number | null;
};

/** eval of one engine */
type EngineEvalReading = {
  /** null when read from the stats block (rows don't tell the color) */
  color: EngineColor | null;
  text: string;
  /** size of the advantage, MATE_PAWNS for mate scores */
  magnitude: number;
  isMate: boolean;
  /**
   * signed value from white's point of view (> 0: good for white),
   * null while the sign convention of the page is unknown
   */
  whitePov: number | null;
};

type EvalPointOfView = "white" | "engine" | "unknown";

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

/** what is known about the watched game to recognize it in the schedule */
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

/** the moment the side to move runs out of time and the engines' activity */
type GameOverInput = {
  now: number;
  lastMoveAt: number;
  /** when the engine stats text last changed, null if it is not displayed */
  statsChangedAt: number | null;
  /** when the side to move runs out of time, null if unknown */
  flagAt: number | null;
};

type GameOverState =
  | { over: false; why: string }
  | {
      over: true;
      /** which signal told the game is over */
      by: "clock" | "stats";
      /** what most likely ended it */
      end: "time-forfeit" | "adjudication" | "unclear";
      why: string;
    };

/** result shown for a game, as remembered by the arbiter */
type ShownResult = {
  outcome: GameOutcome;
  confidence: GameEndConfidence;
  /** moves were played after it was shown: the game went on, it was wrong */
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

  // * =========================
  // * tablebase (certain)

  /** CCC adjudicates drawn 6-man Syzygy positions at once (Info tab) */
  static readonly TB_MAX_PIECES = 6;
  static readonly TABLEBASE_URL = "https://tablebase.lichess.ovh/standard?fen=";
  /**
   * a move right after a drawn tablebase position means CCC did not
   * adjudicate it: wait this long without a move before reporting
   */
  static readonly TABLEBASE_CONFIRM_MS = 1000;
  /** fen -> is a draw, entries kept */
  static readonly TABLEBASE_CACHE_SIZE = 500;

  // * =========================
  // * game over signals (provisional)

  /**
   * the stats text of the engines may stay the same this long during play
   * (engines print at the end of a depth iteration: 3.5-6.1 s measured)
   */
  static readonly STALL_MS = 8000;
  /**
   * no move this long after the side to move's clock ran out = game over
   * (an engine can't think longer than its remaining time, read right
   * after the last move; late in a game that is ~2 s, the increment)
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
  /**
   * time forfeit: the engine output still changed at most this long
   * before its clock reached zero
   */
  static readonly FLAG_ACTIVE_WINDOW_MS = 1000;
  /**
   * not a time forfeit: the engine output was already frozen at least
   * this long before its clock reached zero (the page keeps counting down
   * after any game end)
   */
  static readonly FLAG_FROZEN_BEFORE_MS = 1500;
  /** adjudicated draw: both engines' evals are within ±this (pawns) */
  static readonly DRAW_EVAL_MAX = 0.25;
  /** adjudicated win: both engines see this side at least this far ahead */
  static readonly WIN_EVAL_MIN = 5.0;

  // * =========================
  // * schedule (confirmed)

  /** how long to wait for the schedule to show the result */
  static readonly RESULT_TIMEOUT_MS = 10_000;
  static readonly SCHEDULE_RETRY_MS = 1000;
  /** the schedule tab is opened for at most POLLS * POLL_MS */
  static readonly SCHEDULE_PEEK_POLLS = 10;
  static readonly SCHEDULE_PEEK_POLL_MS = 50;
  /** schedule move count vs watched moves */
  static readonly MOVE_COUNT_TOLERANCE = 1;
  /**
   * end of an event (no next game): no move for this long and engines
   * idle, then look for the watched game among the last finished rows
   */
  static readonly EVENT_END_STALL_MS = 45_000;
  static readonly EVENT_END_RETRY_MS = 30_000;
  static readonly EVENT_END_MAX_CHECKS = 5;
  static readonly EVENT_END_SCAN_ROWS = 3;

  // * =========================
  // * dev

  /** `localStorage.setItem("better-ccc-debug-gameend", "1")` logs decisions */
  static readonly DEBUG_STORAGE_KEY = "better-ccc-debug-gameend";
}

/**
 * how the evals shown by CCC are signed.
 *
 * NOT KNOWN YET: in a game where one side was getting mated, both engine
 * panels and both stats rows showed "+M8" / "+M1", and the losing side
 * "+ 82.50" / "+ 199.88". Until the sign is found, only magnitudes are used
 * (draw adjudications) and win adjudications are never inferred.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class EvalConvention {
  /**
   * - "white": the displayed sign is from white's point of view
   * - "engine": the displayed sign is from the engine's own point of view
   * - "unknown": the displayed sign can't be trusted
   */
  static readonly POINT_OF_VIEW: EvalPointOfView = "unknown";

  /**
   * eval of the engine playing `color` (null: unknown engine),
   * from white's point of view, null if that can't be told
   */
  static toWhitePov(
    color: EngineColor | null,
    displayed: ParsedEval
  ): number | null {
    switch (this.POINT_OF_VIEW) {
      case "white":
        return displayed.pawns;
      case "engine":
        if (!color) return null;
        return color === "white" ? displayed.pawns : -displayed.pawns;
      case "unknown":
        return null;
      default:
        return this.POINT_OF_VIEW satisfies never;
    }
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
  // * evals

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
   * eval shown on an engine panel, e.g. "Torch #1 + 0.80 2:13",
   * "Reckless #2 + 4.45 13/50 0:01.11", "Reckless #2 +M1", "Torch #1 3:02"
   * (no eval yet): the token(s) right after the "#rank"
   */
  static parsePanelEval(text: string | null | undefined): ParsedEval | null {
    const afterRank = text?.match(/#\d+\s+(.*)$/s)?.[1];
    if (!afterRank) {
      return null;
    }

    // "+ 0.80" -> "+0.80"
    const firstToken = afterRank
      .replace(/([+\-−])\s+(?=[\dM#])/g, "$1")
      .trim()
      .split(/\s+/)[0];

    return this.parseEval(firstToken);
  }

  /**
   * evals of the stats block (`.cpu-champs-page-graph`), top row first.
   * Rows don't have a fixed number of columns ("+1.18 22 219.96M 147.38M 13"
   * at the start of a game, "+M1 239 119.3K 0:04 9.45M 0" later), so an eval
   * is a decimal / mate token followed by a depth
   */
  static parseStatsEvals(text: string | null | undefined): ParsedEval[] {
    if (!text) {
      return [];
    }

    const tokens = text
      .replace(/([+\-−])\s+(?=[\dM#])/g, "$1")
      .split(/\s+/)
      .filter(Boolean);
    const evals: ParsedEval[] = [];

    tokens.forEach((token, index) => {
      const isEvalLike = /^[+\-−]?(?:\d+\.\d+|M-?\d+|#-?\d+)$/i.test(token);
      const isDepth = /^\d+(?:\/\d+)?$/.test(tokens[index + 1] ?? "");
      const parsed = isEvalLike && isDepth ? this.parseEval(token) : null;

      if (parsed) {
        evals.push(parsed);
      }
    });

    return evals;
  }

  /** eval readings of the stats block, see `parseStatsEvals` */
  static statsEvalReadings(text: string | null | undefined): EngineEvalReading[] {
    return this.parseStatsEvals(text).map((parsed) => ({
      color: null,
      text: String(parsed.mateIn !== null ? `M${parsed.mateIn}` : parsed.pawns),
      magnitude: Math.abs(parsed.pawns),
      isMate: parsed.mateIn !== null,
      whitePov: EvalConvention.toWhitePov(null, parsed),
    }));
  }

  /**
   * the stats block text reduced to what changes while the engines search,
   * null when it is not displayed. Compared as a whole: rows don't have a
   * fixed number of columns and their order doesn't follow the colors
   */
  static statsSignature(text: string | null | undefined): string | null {
    if (!text) {
      return null;
    }

    const signature = text
      .replace(/\bEval\b|\bDepth\b|\bNodes\b|\bTime\b|\bSpeed\b|\bTB\b|\bHits\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return signature || null;
  }

  /**
   * adjudication guessed from the engines' evals (one per engine):
   * both close to 0 = draw; both far ahead for the same side = win
   * (only when the sign is known, see EvalConvention)
   */
  static inferAdjudication(
    evals: readonly (EngineEvalReading | null)[],
    drawMax = GameEndConfig.DRAW_EVAL_MAX,
    winMin = GameEndConfig.WIN_EVAL_MIN
  ): GameOutcome | null {
    if (evals.length < 2 || evals.some((reading) => !reading)) {
      return null;
    }

    const readings = evals as readonly EngineEvalReading[];

    if (readings.every((reading) => !reading.isMate && reading.magnitude <= drawMax)) {
      return "draw";
    }

    const whitePov = readings.map((reading) => reading.whitePov);

    if (whitePov.every((value) => value !== null && value >= winMin)) {
      return "white";
    }
    if (whitePov.every((value) => value !== null && value <= -winMin)) {
      return "black";
    }

    return null;
  }

  // * =========================
  // * game over

  /**
   * is the game over although no result is shown? Two signals:
   * - clock: the side to move can't think longer than its remaining time
   * - stats: the engines' output stopped changing for STALL_MS
   * and what most likely ended it: a time forfeit if the side to move was
   * still searching right until its clock ran out, an adjudication if the
   * engines had stopped before (the page keeps counting down after any end)
   */
  static classifyGameOver(
    input: GameOverInput,
    cfg: Pick<
      typeof GameEndConfig,
      | "STALL_MS"
      | "OVERTIME_GRACE_MS"
      | "STATS_LATENCY_MS"
      | "FLAG_ACTIVE_WINDOW_MS"
      | "FLAG_FROZEN_BEFORE_MS"
    > = GameEndConfig
  ): GameOverState {
    const { now, lastMoveAt, statsChangedAt, flagAt } = input;

    const statsQuietMs =
      statsChangedAt === null ? null : now - Math.max(statsChangedAt, lastMoveAt);

    // the engine still printed well after its flag time: wrong clock reading
    const clockTrusted =
      flagAt !== null &&
      (statsChangedAt === null || statsChangedAt <= flagAt + cfg.STATS_LATENCY_MS);

    const clockExceeded =
      clockTrusted && flagAt !== null && now >= flagAt + cfg.OVERTIME_GRACE_MS;
    const statsFrozen = statsQuietMs !== null && statsQuietMs >= cfg.STALL_MS;

    if (!clockExceeded && !statsFrozen) {
      return {
        over: false,
        why: statsQuietMs === null ? "engine stats not shown" : "engines active",
      };
    }

    const by = clockExceeded ? "clock" : "stats";

    // the side to move still had time: not a flag
    if (!clockTrusted || flagAt === null || now < flagAt) {
      return {
        over: true,
        by,
        end: "adjudication",
        why:
          flagAt === null
            ? "engines idle, clock unknown"
            : "engines idle before the side to move ran out of time",
      };
    }

    if (statsChangedAt === null) {
      return {
        over: true,
        by,
        end: "unclear",
        why: "clock ran out, engine stats not shown: flag or adjudication?",
      };
    }

    const quietBeforeFlagMs = flagAt - statsChangedAt;

    if (quietBeforeFlagMs <= cfg.FLAG_ACTIVE_WINDOW_MS) {
      return {
        over: true,
        by,
        end: "time-forfeit",
        why: `engine searched until its clock ran out (${quietBeforeFlagMs} ms before)`,
      };
    }
    if (quietBeforeFlagMs >= cfg.FLAG_FROZEN_BEFORE_MS) {
      return {
        over: true,
        by,
        end: "adjudication",
        why: `engines stopped ${quietBeforeFlagMs} ms before the clock ran out`,
      };
    }

    return {
      over: true,
      by,
      end: "unclear",
      why: `engines stopped ${quietBeforeFlagMs} ms before the clock ran out: flag or adjudication?`,
    };
  }

  /**
   * the event may be over: no next game replaced the watched one for a
   * long time and the engines are idle (or not displayed)
   */
  static isEventEndSuspected(
    input: Omit<GameOverInput, "flagAt">,
    eventEndMs = GameEndConfig.EVENT_END_STALL_MS,
    stallMs = GameEndConfig.STALL_MS
  ): boolean {
    const { now, lastMoveAt, statsChangedAt } = input;

    if (now - lastMoveAt < eventEndMs) {
      return false;
    }

    return statsChangedAt === null || now - statsChangedAt >= stallMs;
  }

  // * =========================
  // * schedule

  /** "1-0" / "0-1" / "1/2-1/2" / "½-½" (the first word of the score cell) */
  static parseScore(text: string): GameOutcome | null {
    const score = text.trim().split(/\s+/)[0] ?? "";

    if (score === "1-0") return "white";
    if (score === "0-1") return "black";
    if (score.startsWith("1/2") || score.startsWith("½")) return "draw";
    return null;
  }

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
 * - a result refuted by later moves doesn't count anymore
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
      refuted: false,
    };

    if (!shown) {
      return { notify: true, corrected: false, next: asShown, why: "first result" };
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
