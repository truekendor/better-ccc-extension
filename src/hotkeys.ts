/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

/**
 * additional keyboard shortcuts + `?` help overlay
 *
 * base hotkeys (C / S / Esc / Ctrl+Shift+U) live in script.ts,
 * everything here is gated by both `allowKeyboardShortcuts`
 * and `extraHotkeys` settings
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtraHotkeys {
  private static helpBackdrop: HTMLDivElement | null = null;
  private static noticeTimerId = -1;

  private static hotkeyList: ReadonlyArray<{
    keys: string[];
    description: string;
    extra: boolean;
  }> = [
    { keys: ["?"], description: "Show / hide this help", extra: true },
    { keys: ["C"], description: "Open cross table", extra: false },
    {
      keys: ["S"],
      description: "Open schedule (scrolls to the current game)",
      extra: false,
    },
    {
      keys: ["1", "–", "5"],
      description: "Switch tab: Vote / Standings / Schedule / Match / Info",
      extra: true,
    },
    { keys: ["L"], description: "Jump to the live game", extra: true },
    { keys: ["E"], description: "Open / close the event list", extra: true },
    {
      keys: ["Esc"],
      description: "Close cross table / engine info / popups",
      extra: false,
    },
    {
      keys: ["Ctrl", "Shift", "U"],
      description: "Enable / disable all shortcuts",
      extra: false,
    },
  ];

  static init(): void {
    // capture phase so that Esc closes the help overlay
    // before script.ts closes anything else
    window.addEventListener("keydown", (e) => this.captureHandler(e), true);
    window.addEventListener("keydown", (e) => this.keydownHandler(e));
  }

  static get isEnabled(): boolean {
    return (
      !!UserSettings.customSettings.allowKeyboardShortcuts &&
      !!UserSettings.customSettings.extraHotkeys
    );
  }

  static openHelp(): void {
    if (this.helpBackdrop) return;

    const backdrop = document.createElement("div");
    backdrop.classList.add("ccc-hotkeys-backdrop");

    const panel = document.createElement("div");
    panel.classList.add("ccc-hotkeys-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Keyboard shortcuts");

    const title = document.createElement("h3");
    title.classList.add("ccc-hotkeys-title");
    title.textContent = "Keyboard shortcuts";

    const list = document.createElement("dl");
    list.classList.add("ccc-hotkeys-list");

    this.hotkeyList.forEach(({ keys, description }) => {
      const dt = document.createElement("dt");
      keys.forEach((key) => {
        if (key === "–") {
          dt.append(" – ");
          return;
        }
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        dt.append(kbd);
      });

      const dd = document.createElement("dd");
      dd.textContent = description;

      list.append(dt, dd);
    });

    const footer = document.createElement("p");
    footer.classList.add("ccc-hotkeys-footer");
    footer.textContent =
      "Shortcuts are ignored while typing. Toggle them in the extension settings (cross table → gear icon).";

    panel.append(title, list, footer);
    backdrop.append(panel);

    backdrop.addEventListener("click", (e) => {
      if (e.target !== backdrop) return;
      this.closeHelp();
    });

    document.body.append(backdrop);
    this.helpBackdrop = backdrop;
  }

  static closeHelp(): void {
    if (!this.helpBackdrop) return;

    Utils.removeNode(this.helpBackdrop);
    this.helpBackdrop = null;
  }

  static toggleHelp(): void {
    if (this.helpBackdrop) {
      this.closeHelp();
    } else {
      this.openHelp();
    }
  }

  // * ---------------
  // * handlers

  private static captureHandler(e: KeyboardEvent): void {
    if (e.code !== "Escape" || !this.helpBackdrop) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    this.closeHelp();
  }

  private static keydownHandler(e: KeyboardEvent): void {
    if (!this.isEnabled) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (this.isTypingTarget(e.target)) return;

    // checked first and by `key` since `?` sits on a different
    // physical key depending on keyboard layout
    if (e.key === "?") {
      e.preventDefault();
      this.toggleHelp();
      return;
    }

    const tabIndex = this.getTabIndexFromCode(e.code);
    if (tabIndex !== -1) {
      this.switchTab(tabIndex);
      return;
    }

    if (e.code === "KeyL") {
      this.jumpToLiveGame();
      return;
    }

    if (e.code === "KeyE") {
      this.toggleEventList();
      return;
    }
  }

  // * ---------------
  // * actions

  private static switchTab(index: number): void {
    const btn = _DOM_Store.tabButtons[index];
    if (!btn) return;

    btn.click();
  }

  private static jumpToLiveGame(): void {
    const liveGame = this.findLiveGame();
    if (liveGame) {
      this.clickLiveGame(liveGame);
      return;
    }

    // schedule is not rendered: open it and wait for the live game row
    _DOM_Store.scheduleBtn?.click();

    let attempts = 0;
    const tryClick = (): void => {
      const game = this.findLiveGame();
      if (game) {
        this.clickLiveGame(game);
        return;
      }

      attempts += 1;
      if (attempts < 20) {
        setTimeout(tryClick, 100);
        return;
      }

      this.showNotice("No game in progress");
    };

    setTimeout(tryClick, 50);
  }

  private static clickLiveGame(game: HTMLElement): void {
    game.click();
    game.scrollIntoView({ block: "nearest" });
    this.showNotice("Live game");
  }

  private static findLiveGame(): HTMLElement | null {
    return _DOM_Store.bottomPanel.querySelector<HTMLElement>(
      ".schedule-container .schedule-in-progress"
    );
  }

  private static toggleEventList(): void {
    const eventNameWrapper = _DOM_Store.bottomPanel.querySelector<HTMLElement>(
      ".bottomtable-event-name-wrapper"
    );

    eventNameWrapper?.click();
  }

  // * ---------------
  // * utils

  /** small transient message at the bottom of the screen */
  private static showNotice(text: string): void {
    if (!text) return;

    let notice = document.querySelector<HTMLDivElement>(".ccc-hotkey-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.classList.add("ccc-hotkey-notice");
      notice.setAttribute("aria-live", "polite");
      document.body.append(notice);
    }

    notice.textContent = text;
    notice.classList.add("ccc-hotkey-notice_visible");

    clearTimeout(this.noticeTimerId);
    this.noticeTimerId = setTimeout(() => {
      notice?.classList.remove("ccc-hotkey-notice_visible");
    }, 1200);
  }

  private static getTabIndexFromCode(code: string): number {
    const match = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (!match) return -1;

    return parseInt(match[1]!) - 1;
  }

  private static isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
}

ExtraHotkeys.init();
