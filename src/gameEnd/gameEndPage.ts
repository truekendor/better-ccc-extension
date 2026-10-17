/**
 * Live game end detection, part 2 of 4: everything read from the page.
 *
 * - moves: `_DOM_Store.movesTable` (the same <table> for every game)
 * - engine panels: `#white-player` / `#black-player` (id = color), only
 *   rendered while the middle "Engines" tab is shown, re-created on tab
 *   switches; `#enginedata-eval` = `<span>{sign}</span> <span>{number}</span>`
 *   (a mate is all in the first span: "+M13"), white-relative
 * - engine stats: `#graph-valuebar`, first child `div.black-box` (Black),
 *   second `div.white-box` (White), six spans each: Eval, Depth, Nodes,
 *   Time, Speed, TB Hits
 * - result box: `.movetable-gameResult.movetable-white|black|draw` and
 *   `.enginedata-win|loss|draw` on the panels, ~14 s after the end, only
 *   when no next game follows at once (end of the event)
 * - schedule: `.schedule-container .schedule-game-link` rows, only rendered
 *   while the bottom "Schedule" tab is open
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndPage {
  /** schedule tab peeks run one at a time */
  private static peekQueue: Promise<unknown> = Promise.resolve();

  // * =========================
  // * moves

  /** CCC puts `game=N` in the hash while an archived game is displayed */
  static isArchiveView(): boolean {
    return /(^#|&)game=/.test(window.location.hash);
  }

  static readLivePgn(): string[] {
    return ExtractPageData.getPGNFromMoveTable();
  }

  // * =========================
  // * engine panels

  private static getPanel(color: EngineColor): HTMLElement | null {
    return document.getElementById(`${color}-player`);
  }

  static readEngineName(color: EngineColor): string {
    const player = this.getPanel(color);
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

  /** remaining time on the engine panel, null if not displayed */
  static readClockSeconds(color: EngineColor): number | null {
    const text = this.getPanel(color)
      ?.querySelector(".enginedata-clock")
      ?.textContent?.trim();

    return GameEndRules.parseClockSeconds(text);
  }

  /** eval on the engine panel of `color` (white-relative), null if none */
  static readEvalForColor(color: EngineColor): ParsedEval | null {
    const evalEl = this.getPanel(color)?.querySelector("#enginedata-eval");
    if (!evalEl) {
      return null;
    }

    // "<span>+</span> <span>0.61</span>" or "<span>+M13</span><span></span>"
    const text = Array.from(evalEl.children)
      .map((span) => span.textContent ?? "")
      .join("");

    return GameEndRules.parseEval(text || evalEl.textContent);
  }

  /** which panel shows the "thinking" icon, for the debug log only */
  static readTurnIndicator(): EngineColor | "none" | "hidden" {
    const white = this.getPanel("white");
    const black = this.getPanel("black");

    if (!white && !black) return "hidden";
    if (white?.querySelector(".enginedata-rotating")) return "white";
    if (black?.querySelector(".enginedata-rotating")) return "black";
    return "none";
  }

  // * =========================
  // * engine stats

  /**
   * stats box of the engine playing `color`: its signature (what changes
   * while it searches) and its eval; null if not displayed
   */
  static readValueBox(
    color: EngineColor
  ): { signature: string; eval: ParsedEval | null } | null {
    const box = document.querySelector(`#graph-valuebar > .${color}-box`);
    if (!box) {
      return null;
    }

    const spans = Array.from(box.children)
      .filter((el) => el.tagName === "SPAN")
      .map((span) => span.textContent ?? "");

    if (spans.length < 6) {
      return null;
    }

    return {
      signature: GameEndRules.valueBoxSignature(spans),
      eval: GameEndRules.parseEval(spans[0]),
    };
  }

  /** the score `color`'s engine shows: its stats box, else its panel */
  static readScore(color: EngineColor): ParsedEval | null {
    return this.readValueBox(color)?.eval ?? this.readEvalForColor(color);
  }

  // * =========================
  // * result shown by the page

  /**
   * result box of the moves table, or the engine panels' win / loss / draw
   * colors; null while the game is not over (or the next one started)
   */
  static readPageResult(): PageResult | null {
    const box = _DOM_Store.movesTableContainer?.querySelector(
      ".movetable-gameResult"
    );

    if (box) {
      const result = GameEndRules.parsePageResult(
        this.classesOf(box, ["movetable-white", "movetable-black", "movetable-draw"]),
        box.textContent ?? ""
      );
      if (result) {
        return result;
      }
    }

    const whitePanel = this.getPanel("white")?.querySelector(
      ".enginedata-container"
    );
    const outcome = whitePanel
      ? GameEndRules.outcomeFromPanelClasses(
          this.classesOf(whitePanel, ["enginedata-win", "enginedata-loss", "enginedata-draw"])
        )
      : null;

    return outcome ? { outcome, reason: "" } : null;
  }

  /** which of `names` the element has */
  private static classesOf(el: Element, names: readonly string[]): string[] {
    return names.filter((name) => el.classList.contains(name));
  }

  // * =========================
  // * schedule

  /** parsed schedule rows (page order), null if the schedule isn't rendered */
  static readScheduleRows(): ScheduleRowInfo[] | null {
    const container = document.querySelector(".schedule-container");
    if (!container) {
      return null;
    }

    return Array.from(container.querySelectorAll(".schedule-game-link"))
      .map((row) => GameEndRules.readScheduleRow(row))
      .filter((row): row is ScheduleRowInfo => row !== null);
  }

  /**
   * runs `pick` on the schedule rows. The schedule is only rendered while
   * its tab is open, so the tab is opened for a moment if needed and
   * `allowPeek` (never in a background tab)
   */
  static async findInSchedule(
    pick: (rows: ScheduleRowInfo[]) => SchedulePick,
    allowPeek = true
  ): Promise<SchedulePick> {
    const rows = this.readScheduleRows();
    if (rows && rows.length > 0) {
      return pick(rows);
    }

    if (!allowPeek || document.hidden) {
      return { status: "pending", why: "schedule not shown" };
    }

    const peek = this.peekQueue.then(() => this.peekSchedule(pick));
    this.peekQueue = peek.catch(() => undefined);

    return peek;
  }

  /** opens the schedule tab, reads the rows and goes back to the previous tab */
  private static async peekSchedule(
    pick: (rows: ScheduleRowInfo[]) => SchedulePick
  ): Promise<SchedulePick> {
    const scheduleBtn = _DOM_Store.scheduleBtn;
    const buttons = Array.from(_DOM_Store.tabButtons ?? []);
    const previousBtn = buttons.find((btn) =>
      btn.classList.contains("selection-panel-selected")
    );

    if (!scheduleBtn || !previousBtn || previousBtn === scheduleBtn) {
      return { status: "pending", why: "schedule tab not available" };
    }

    let result: SchedulePick = {
      status: "pending",
      why: "schedule did not render",
    };

    // timers may be throttled: the tab stays open for a bounded time
    const deadline =
      Date.now() +
      GameEndConfig.SCHEDULE_PEEK_POLLS * GameEndConfig.SCHEDULE_PEEK_POLL_MS;

    scheduleBtn.click();

    try {
      for (let i = 0; i < GameEndConfig.SCHEDULE_PEEK_POLLS; i++) {
        await Utils.sleepAsync(GameEndConfig.SCHEDULE_PEEK_POLL_MS);
        if (Date.now() > deadline + GameEndConfig.SCHEDULE_PEEK_POLL_MS) {
          break;
        }

        const rows = this.readScheduleRows();
        if (!rows || rows.length === 0) {
          continue;
        }

        result = pick(rows);
        if (result.status !== "pending") {
          break;
        }
      }
    } finally {
      previousBtn.click();
    }

    return result;
  }
}

/**
 * detector decisions in the console, enabled with
 * `localStorage.setItem("better-ccc-debug-gameend", "1")`
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GameEndDebug {
  /** last message per source: the 500 ms checks repeat themselves */
  private static readonly lastMessages = new Map<string, string>();

  static isEnabled(): boolean {
    try {
      return localStorage.getItem(GameEndConfig.DEBUG_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  /** logs `message` unless it is the same as the last one from `source` */
  static log(source: string, message: string, data?: unknown): void {
    if (!this.isEnabled()) {
      return;
    }
    if (this.lastMessages.get(source) === message) {
      return;
    }
    this.lastMessages.set(source, message);

    const time = new Date().toLocaleTimeString();

    if (data === undefined) {
      console.log(`better-ccc: [game end ${time}] ${source}: ${message}`);
    } else {
      console.log(`better-ccc: [game end ${time}] ${source}: ${message}`, data);
    }
  }
}
