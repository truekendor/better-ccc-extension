/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

/**
 * Game end notifications: a short result toast over the board
 * and an optional chime when the *live* game finishes.
 *
 * How the end of the live game is detected:
 * CCC does not render any result for the live game. When it ends, the page
 * jumps straight to the next game: the moves table is refilled with the new
 * game (same <table> element) and the schedule row of the finished game gets
 * its score ("1-0  86 Moves"). So:
 * - the live moves are tracked while they grow move by move
 * - when they are replaced by a different, shorter game (and no archived game
 *   was opened, CCC adds `game=` to the hash for those) the live game ended
 * - the result is read from the schedule row right before the new
 *   "In Progress..." row. The schedule is only rendered while its tab is
 *   open, so the tab is opened for a moment if needed.
 */

type GameOutcome = "white" | "black" | "draw";

type GameEndInfo = {
  outcome: GameOutcome;
  white: string;
  black: string;
  /** extra line under the result, e.g. "Game 467 · 86 moves"; may be empty */
  reason: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndWatcher {
  /** the game must be watched in progress at least this long (ms) */
  private static readonly MIN_WATCH_TIME_MS = 5000;
  /** shorter games are not reported (book moves are loaded at once) */
  private static readonly MIN_PLIES = 10;
  /** moves table mutations come in bursts, wait for the table to settle */
  private static readonly SETTLE_DELAY_MS = 400;
  /** how long to wait for the schedule to show the score */
  private static readonly RESULT_TIMEOUT_MS = 10_000;

  /** moves of the live game while it is in progress, null when unknown */
  private static livePgn: string[] | null = null;
  /** when the current in-progress game started being watched */
  private static liveSince = 0;
  private static settleTimerId = 0;

  private static readonly notifiedGames = new Set<string>();
  private static readonly cachedNames = { white: "", black: "" };

  static init(): void {
    const table = _DOM_Store.movesTable;

    if (!table) {
      return;
    }

    this.updateLiveSnapshot();

    const movesObserver = new MutationObserver(() => {
      clearTimeout(this.settleTimerId);
      this.settleTimerId = window.setTimeout(() => {
        this.updateLiveSnapshot();
      }, this.SETTLE_DELAY_MS);
    });
    movesObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // opening an archived game or going back to the live one replaces
    // the moves too: start over instead of reporting a game end
    window.addEventListener("hashchange", () => {
      this.livePgn = null;
    });
  }

  /** CCC puts `game=N` in the hash while an archived game is displayed */
  static isArchiveView(): boolean {
    return /(^#|&)game=/.test(window.location.hash);
  }

  static getEngineName(color: "white" | "black"): string {
    return this.readEngineName(color) || this.cachedNames[color] || "";
  }

  private static updateLiveSnapshot(): void {
    if (this.isArchiveView()) {
      this.livePgn = null;
      return;
    }

    const pgn = ExtractPageData.getPGNFromMoveTable();

    // table is being re-rendered
    if (pgn.length === 0) {
      return;
    }

    const previousPgn = this.livePgn;

    if (previousPgn && this.isContinuation(previousPgn, pgn)) {
      this.livePgn = pgn;
      this.cacheEngineNames();
      return;
    }

    // a different game replaced the one being watched
    if (
      previousPgn &&
      previousPgn.length >= this.MIN_PLIES &&
      pgn.length < previousPgn.length &&
      Date.now() - this.liveSince >= this.MIN_WATCH_TIME_MS
    ) {
      this.handleLiveGameEnded(previousPgn, { ...this.cachedNames });
    }

    this.livePgn = pgn;
    this.liveSince = Date.now();
    this.cachedNames.white = "";
    this.cachedNames.black = "";
    this.cacheEngineNames();
  }

  private static async handleLiveGameEnded(
    finalPgn: string[],
    names: { white: string; black: string }
  ): Promise<void> {
    try {
      const row = await this.waitForFinishedGameRow();

      if (!row) {
        console.log("better-ccc: live game ended, result not found");
        return;
      }

      const info = this.readScheduleRow(row.element);
      if (!info) {
        return;
      }

      info.white ||= names.white;
      info.black ||= names.black;

      const gameKey = [_State.eventId ?? "", row.gameNumber, finalPgn[0]].join(
        "|"
      );

      if (this.notifiedGames.has(gameKey)) {
        return;
      }
      this.notifiedGames.add(gameKey);

      GameResultToast.notify(info);
    } catch (e) {
      Utils.logError(e);
    }
  }

  /**
   * row of the game that just finished: right before the "In Progress..."
   * row, once its score is shown. Opens the schedule tab for a moment
   * when it isn't rendered
   */
  private static async waitForFinishedGameRow(): Promise<{
    element: Element;
    gameNumber: string;
  } | null> {
    const deadline = Date.now() + this.RESULT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const row =
        this.findFinishedGameRow() ?? (await this.peekScheduleTab());

      if (row) {
        return row;
      }

      await Utils.sleepAsync(1000);
    }

    return null;
  }

  private static findFinishedGameRow(): {
    element: Element;
    gameNumber: string;
  } | null {
    const inProgress = document.querySelector(
      ".schedule-container .schedule-in-progress"
    );
    const row = inProgress?.previousElementSibling;

    if (!row || !row.classList.contains("schedule-game-link")) {
      return null;
    }
    if (!this.readScheduleRow(row)) {
      return null;
    }

    const gameNumber =
      row.querySelector(".schedule-index")?.textContent?.trim() ?? "";

    return { element: row, gameNumber };
  }

  /** opens the schedule tab, reads the row and goes back to the previous tab */
  private static async peekScheduleTab(): Promise<{
    element: Element;
    gameNumber: string;
  } | null> {
    const scheduleBtn = _DOM_Store.scheduleBtn;
    const buttons = Array.from(_DOM_Store.tabButtons ?? []);
    const previousBtn = buttons.find((btn) =>
      btn.classList.contains("selection-panel-selected")
    );

    if (!scheduleBtn || !previousBtn || previousBtn === scheduleBtn) {
      return null;
    }

    scheduleBtn.click();

    let row: ReturnType<typeof this.findFinishedGameRow> = null;
    for (let i = 0; i < 10 && !row; i++) {
      await Utils.sleepAsync(50);
      row = this.findFinishedGameRow();
    }

    // keep the data, the element is gone once the tab is closed
    const result = row
      ? { element: row.element.cloneNode(true) as Element, gameNumber: row.gameNumber }
      : null;

    previousBtn.click();

    return result;
  }

  /**
   * schedule row of a finished game:
   *   <div.schedule-index>467</div> <img> <div.win>#1 Torch</div>
   *   <div>1-0  86 Moves</div> <div.loss>#2 Reckless</div> <img>
   */
  private static readScheduleRow(row: Element): GameEndInfo | null {
    const cells = Array.from(row.children).filter(
      (el) => el.tagName === "DIV"
    );
    const [indexCell, whiteCell, scoreCell, blackCell] = cells;

    if (!indexCell || !whiteCell || !scoreCell || !blackCell) {
      return null;
    }

    const scoreText = (scoreCell.textContent ?? "").trim();
    const score = Utils.removeWhitespace(scoreText.split(/\s+/)[0] ?? "");

    let outcome: GameOutcome | null = null;
    if (score === "1-0") {
      outcome = "white";
    } else if (score === "0-1") {
      outcome = "black";
    } else if (score.startsWith("1/2") || score.startsWith("½")) {
      outcome = "draw";
    }

    if (!outcome) {
      return null;
    }

    const cleanName = (cell: Element) =>
      (cell.textContent ?? "").replace(/^\s*#\d+\s*/, "").trim();

    const gameNumber = (indexCell.textContent ?? "").trim();
    const moves = scoreText.match(/(\d+)\s*Moves?/i)?.[1];
    const reason = [
      gameNumber && `Game ${gameNumber}`,
      moves && `${moves} moves`,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      outcome,
      white: cleanName(whiteCell),
      black: cleanName(blackCell),
      reason,
    };
  }

  /** true if `next` is `prev` plus the moves played since */
  private static isContinuation(prev: string[], next: string[]): boolean {
    if (next.length < prev.length) {
      return false;
    }

    return prev.every((move, index) => next[index] === move);
  }

  private static cacheEngineNames(): void {
    const white = this.readEngineName("white");
    const black = this.readEngineName("black");

    if (white) {
      this.cachedNames.white = white;
    }
    if (black) {
      this.cachedNames.black = black;
    }
  }

  /**
   * engine panels are `#white-player` / `#black-player`;
   * they are not rendered when another middle tab (twitch/analysis) is open
   */
  private static readEngineName(color: "white" | "black"): string {
    const player = document.getElementById(`${color}-player`);
    if (!player) {
      return "";
    }

    const nameSpan = player.querySelector("#enginedata-rightOfImage > span");
    const name = nameSpan?.textContent?.trim();
    if (name && name !== "undefined") {
      return name;
    }

    // title looks like "#3 Reckless"
    const title =
      player.querySelector(".enginedata-container")?.getAttribute("title") ??
      "";
    const nameFromTitle = title.replace(/^#\S*\s*/, "").trim();

    return nameFromTitle === "undefined" ? "" : nameFromTitle;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameResultToast {
  /** must match the animation duration in styles/toast.css */
  private static readonly TOTAL_DURATION_MS = 3250;
  private static readonly ANIMATION_NAMES = [
    "ccc-result-toast-pop",
    "ccc-result-toast-fade",
  ];

  private static toast: HTMLDivElement | null = null;
  private static removeTimerId = 0;

  /** called when the live game ended */
  static notify(info: GameEndInfo): void {
    if (UserSettings.customSettings.showResultToast && !document.hidden) {
      this.show(info);
    }

    if (UserSettings.customSettings.playGameEndSound) {
      GameEndSound.play(info.outcome);
    }
  }

  static show(info: GameEndInfo): void {
    this.dismiss();

    const toast = document.createElement("div");
    const card = document.createElement("div");
    const headline = document.createElement("div");
    const title = document.createElement("span");
    const separator = document.createElement("span");
    const score = document.createElement("span");

    toast.classList.add("ccc-result-toast");
    card.classList.add(
      "ccc-result-toast_card",
      `ccc-result-toast_${info.outcome}`
    );
    headline.classList.add("ccc-result-toast_headline");
    title.classList.add("ccc-result-toast_title");
    separator.classList.add("ccc-result-toast_separator");
    score.classList.add("ccc-result-toast_score");

    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    title.textContent = this.getTitle(info);
    separator.textContent = "·";
    score.textContent = this.getScore(info.outcome);

    headline.append(title, separator, score);
    card.append(headline);

    if (info.reason) {
      const reason = document.createElement("div");
      reason.classList.add("ccc-result-toast_reason");
      reason.textContent = info.reason;

      card.append(reason);
    }

    toast.append(card);

    const { x, y } = this.getAnchorPoint();
    toast.style.setProperty("--ccc-toast-x", `${x}px`);
    toast.style.setProperty("--ccc-toast-y", `${y}px`);

    card.addEventListener("animationend", (e) => {
      if (this.ANIMATION_NAMES.includes(e.animationName)) {
        this.dismiss();
      }
    });

    // in case animations are disabled or never end
    this.removeTimerId = window.setTimeout(() => {
      this.dismiss();
    }, this.TOTAL_DURATION_MS + 500);

    document.body.append(toast);
    this.toast = toast;
  }

  static dismiss(): void {
    clearTimeout(this.removeTimerId);

    if (this.toast) {
      Utils.removeNode(this.toast);
      this.toast = null;
    }
  }

  /**
   * debug helper, shows the toast (and plays the sound if enabled)
   * for the given result: "1-0" | "0-1" | "1/2-1/2"
   */
  static test(result = "1-0"): void {
    const value = result.trim().toLowerCase();

    let outcome: GameOutcome = "draw";
    if (value === "1-0" || value === "white") {
      outcome = "white";
    } else if (value === "0-1" || value === "black") {
      outcome = "black";
    }

    const reasons: Record<GameOutcome, string> = {
      white: "Checkmate",
      black: "Adjudication",
      draw: "Repetition",
    };

    const info: GameEndInfo = {
      outcome,
      white: GameEndWatcher.getEngineName("white"),
      black: GameEndWatcher.getEngineName("black"),
      reason: reasons[outcome],
    };

    this.show(info);

    if (UserSettings.customSettings.playGameEndSound) {
      GameEndSound.play(outcome);
    }
  }

  /**
   * lets the page console trigger the toast:
   * `window.dispatchEvent(new CustomEvent("better-ccc:test-result", { detail: "0-1" }))`
   */
  static initDebugHook(): void {
    window.addEventListener("better-ccc:test-result", (e) => {
      let detail: unknown;

      try {
        detail = (e as CustomEvent).detail;
      } catch {
        // objects created by the page are not readable from content scripts
      }

      this.test(typeof detail === "string" ? detail : "1-0");
    });
  }

  private static getTitle(info: GameEndInfo): string {
    if (info.outcome === "draw") {
      return "Draw";
    }

    const fallback = info.outcome === "white" ? "White" : "Black";
    const winner = info.outcome === "white" ? info.white : info.black;

    return `${winner || fallback} wins`;
  }

  private static getScore(outcome: GameOutcome): string {
    switch (outcome) {
      case "white":
        return "1-0";
      case "black":
        return "0-1";
      case "draw":
        return "½-½";
      default:
        // exhaustive check
        return outcome satisfies never;
    }
  }

  /** center of the main board, or of the viewport if it can't be found */
  private static getAnchorPoint(): { x: number; y: number } {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const fallback = { x: viewportWidth / 2, y: viewportHeight / 2 };

    // the main board is the element right before the main moves table
    const board = _DOM_Store.movesTableContainer?.closest(
      ".movetable-movetable"
    )?.previousElementSibling;

    if (!board) {
      return fallback;
    }

    const rect = board.getBoundingClientRect();
    const isVisible =
      rect.width >= 150 &&
      rect.height >= 150 &&
      rect.bottom > 0 &&
      rect.top < viewportHeight &&
      rect.right > 0 &&
      rect.left < viewportWidth;

    if (!isVisible) {
      return fallback;
    }

    const margin = Math.min(160, viewportWidth / 2);

    return {
      x: this.clamp(
        rect.left + rect.width / 2,
        margin,
        viewportWidth - margin
      ),
      y: this.clamp(rect.top + rect.height / 2, 60, viewportHeight - 60),
    };
  }

  private static clamp(value: number, min: number, max: number): number {
    if (min > max) {
      return value;
    }
    return Math.min(Math.max(value, min), max);
  }
}

/**
 * short chime generated with the Web Audio API
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndSound {
  private static audioContext: AudioContext | null = null;

  /**
   * browsers keep an AudioContext suspended until the user interacts
   * with the page, so resume it on interactions while the setting is on
   */
  static init(): void {
    const unlock = () => {
      if (!UserSettings.customSettings.playGameEndSound) {
        return;
      }
      if (this.audioContext?.state === "running") {
        return;
      }

      this.getContext()
        ?.resume()
        .catch(() => undefined);
    };

    window.addEventListener("pointerdown", unlock, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", unlock, {
      capture: true,
      passive: true,
    });
  }

  /** plays the chime right after the setting is enabled (user gesture) */
  static preview(): void {
    this.play("white");
  }

  static async play(outcome: GameOutcome): Promise<void> {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        return;
      }

      if (!this.isRunning(ctx)) {
        // resume() may never settle when autoplay is blocked
        await Promise.race([
          ctx.resume().catch(() => undefined),
          Utils.sleepAsync(300),
        ]);
      }

      if (!this.isRunning(ctx)) {
        console.log(
          "better-ccc: game end sound is blocked until you interact with the page"
        );
        return;
      }

      this.chime(ctx, outcome);
    } catch (e) {
      Utils.logError(e);
    }
  }

  private static getContext(): AudioContext | null {
    if (this.audioContext && this.audioContext.state !== "closed") {
      return this.audioContext;
    }
    if (typeof AudioContext === "undefined") {
      return null;
    }

    try {
      this.audioContext = new AudioContext();
    } catch (e) {
      Utils.logError(e);
      this.audioContext = null;
    }

    return this.audioContext;
  }

  private static isRunning(ctx: AudioContext): boolean {
    return ctx.state === "running";
  }

  /**
   * decisive result: rising major arpeggio,
   * draw: softer two-note fifth
   */
  private static chime(ctx: AudioContext, outcome: GameOutcome): void {
    // E5 G#5 B5 | D5 A5
    const notes =
      outcome === "draw" ? [587.33, 880.0] : [659.25, 830.61, 987.77];
    const noteGap = 0.11;
    const noteLength = outcome === "draw" ? 1.2 : 1.0;

    const master = ctx.createGain();
    master.gain.value = 0.16;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4500;

    master.connect(filter);
    filter.connect(ctx.destination);

    const start = ctx.currentTime + 0.02;

    notes.forEach((frequency, index) => {
      this.bell(ctx, master, frequency, start + index * noteGap, noteLength);
    });

    const end = start + (notes.length - 1) * noteGap + noteLength + 0.1;

    // free the nodes once the chime is over
    window.setTimeout(() => {
      master.disconnect();
      filter.disconnect();
    }, (end - ctx.currentTime) * 1000 + 100);
  }

  /** one bell-like note: sine + soft overtone with a fast attack */
  private static bell(
    ctx: AudioContext,
    output: AudioNode,
    frequency: number,
    start: number,
    duration: number
  ): void {
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    envelope.connect(output);

    const partials: readonly [multiplier: number, level: number][] = [
      [1, 1],
      [2.005, 0.2],
      [3.01, 0.06],
    ];

    partials.forEach(([multiplier, level]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency * multiplier;
      gain.gain.value = level;

      oscillator.connect(gain);
      gain.connect(envelope);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);

      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      });
    });
  }
}

(function initGameEndNotifications(): void {
  try {
    GameEndWatcher.init();
    GameEndSound.init();
    GameResultToast.initDebugHook();
  } catch (e) {
    Utils.logError(e);
  }
})();
