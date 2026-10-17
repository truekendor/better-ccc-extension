/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

/**
 * Game end notifications: a short result toast over the board
 * and an optional chime when the *live* game finishes.
 *
 * The end of the live game is detected by the scripts in `gameEnd/`
 * (loaded before this one), which call `GameResultToast.notify` once per
 * game: see gameEnd/gameEndWatcher.ts for how.
 */

type GameEndInfo = {
  outcome: GameOutcome;
  white: string;
  black: string;
  /** extra line under the result, e.g. "Game 467 · 86 moves"; may be empty */
  reason: string;
  /** number of moves shown in the schedule, if known */
  moveCount?: number;
};

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
