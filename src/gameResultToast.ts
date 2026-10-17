/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

/**
 * Game end notifications: a short result toast over the board
 * and an optional chime when the *live* game finishes.
 *
 * How the end of the live game is detected:
 * CCC renders `.movetable-gameResult` (with `movetable-white` /
 * `movetable-black` / `movetable-draw`) inside the moves table wrapper
 * as soon as the displayed game has a result. That element also shows up
 * when the page loads on a finished game or when an old game is opened
 * from the schedule, so it only counts as "the live game just ended" if:
 * - the URL hash has no `game=` (CCC adds it when an archived game is open)
 * - the same game was watched in progress (no result) for a while before
 * - the final moves continue the moves seen while it was in progress
 * - this game was not reported before
 */

type GameOutcome = "white" | "black" | "draw";

type GameEndInfo = {
  outcome: GameOutcome;
  white: string;
  black: string;
  /** termination reason as displayed by CCC, e.g. "Checkmate"; may be empty */
  reason: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndWatcher {
  /** the game must be watched in progress at least this long (ms) */
  private static readonly MIN_WATCH_TIME_MS = 1500;
  /** max plies between the last in-progress position and the final one */
  private static readonly MAX_PLY_GAP = 2;

  /** moves of the live game while it is in progress, null when unknown */
  private static livePgn: string[] | null = null;
  /** when the current in-progress game started being watched */
  private static liveSince = 0;
  private static resultShown = false;

  private static readonly notifiedGames = new Set<string>();
  private static readonly cachedNames = { white: "", black: "" };

  static init(): void {
    const container = _DOM_Store.movesTableContainer;
    const table = _DOM_Store.movesTable;

    if (!container || !table) {
      return;
    }

    this.resultShown = !!ExtractPageData.getGameResultDiv();
    this.updateLiveSnapshot();

    // result element is a direct child of the table wrapper
    const resultObserver = new MutationObserver(() => {
      this.handleResultChange();
    });
    resultObserver.observe(container, {
      childList: true,
    });

    const movesObserver = new MutationObserver(() => {
      this.updateLiveSnapshot();
    });
    movesObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("hashchange", () => {
      this.updateLiveSnapshot();
    });
  }

  /** CCC puts `game=N` in the hash while an archived game is displayed */
  static isArchiveView(): boolean {
    return /(^#|&)game=/.test(window.location.hash);
  }

  static readGameEndInfo(resultDiv: Element): GameEndInfo | null {
    const classes = resultDiv.classList;
    const children = resultDiv.children;

    let outcome: GameOutcome | null = null;

    if (classes.contains("movetable-white")) {
      outcome = "white";
    } else if (classes.contains("movetable-black")) {
      outcome = "black";
    } else if (classes.contains("movetable-draw")) {
      outcome = "draw";
    } else {
      // second child holds the score, like "1 - 0"
      const score = Utils.removeWhitespace(children[1]?.textContent ?? "");

      if (score === "1-0") {
        outcome = "white";
      } else if (score === "0-1") {
        outcome = "black";
      } else if (score.startsWith("1/2") || score.startsWith("½")) {
        outcome = "draw";
      }
    }

    if (!outcome) {
      return null;
    }

    // third child holds the termination reason, like "Checkmate"
    const reason = (children[2]?.textContent ?? "").trim();

    return {
      outcome,
      white: this.getEngineName("white"),
      black: this.getEngineName("black"),
      reason,
    };
  }

  static getEngineName(color: "white" | "black"): string {
    return this.readEngineName(color) || this.cachedNames[color] || "";
  }

  private static handleResultChange(): void {
    const resultDiv = ExtractPageData.getGameResultDiv();
    const hasResult = !!resultDiv;

    if (hasResult === this.resultShown) {
      return;
    }
    this.resultShown = hasResult;

    if (!resultDiv) {
      // new game or back from an archived game
      this.updateLiveSnapshot();
      return;
    }

    const watchedPgn = this.livePgn;
    const watchedSince = this.liveSince;
    this.livePgn = null;

    if (!watchedPgn || this.isArchiveView()) {
      return;
    }

    const finalPgn = ExtractPageData.getPGNFromMoveTable();

    if (finalPgn.length === 0 || !this.isContinuation(watchedPgn, finalPgn)) {
      return;
    }
    if (Date.now() - watchedSince < this.MIN_WATCH_TIME_MS) {
      return;
    }

    const info = this.readGameEndInfo(resultDiv);
    if (!info) {
      return;
    }

    const gameKey = [
      _State.eventId ?? "",
      info.white,
      info.black,
      finalPgn.join(" "),
    ].join("|");

    if (this.notifiedGames.has(gameKey)) {
      return;
    }
    this.notifiedGames.add(gameKey);

    GameResultToast.notify(info);
  }

  private static updateLiveSnapshot(): void {
    if (this.isArchiveView()) {
      this.livePgn = null;
      return;
    }

    // game is over: keep the last in-progress moves for comparison
    if (ExtractPageData.getGameResultDiv()) {
      return;
    }

    const pgn = ExtractPageData.getPGNFromMoveTable();

    if (!this.livePgn || !this.isContinuation(this.livePgn, pgn)) {
      this.liveSince = Date.now();
    }
    this.livePgn = pgn;

    this.cacheEngineNames();
  }

  /** true if `next` is `prev` plus at most `MAX_PLY_GAP` moves */
  private static isContinuation(prev: string[], next: string[]): boolean {
    const gap = next.length - prev.length;

    if (gap < 0 || gap > this.MAX_PLY_GAP) {
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
