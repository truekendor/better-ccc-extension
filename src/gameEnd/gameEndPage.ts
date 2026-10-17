/**
 * Live game end detection, part 2 of 4: everything read from the page.
 *
 * - moves: `_DOM_Store.movesTable` (the same <table> for every game)
 * - engine panels: `#white-player` / `#black-player`, only rendered while
 *   the middle "Engines" tab is shown, re-created on tab switches
 * - engine stats: `.cpu-champs-page-graph` ("Eval Depth Nodes Time ..."
 *   then one row per engine that searched, then the graph axis labels)
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

  /**
   * eval of the engine playing `color`, from its panel
   * ("Torch #1 + 0.80 2:13"). The sign is not trusted, see EvalConvention
   */
  static readEvalForColor(color: EngineColor): EngineEvalReading | null {
    const container = this.getPanel(color)?.querySelector(
      ".enginedata-container"
    ) as HTMLElement | null | undefined;
    const text = container?.innerText ?? container?.textContent ?? "";
    const parsed = GameEndRules.parsePanelEval(text);

    if (!parsed) {
      return null;
    }

    return {
      color,
      text: text.replace(/\s+/g, " ").trim(),
      magnitude: Math.abs(parsed.pawns),
      isMate: parsed.mateIn !== null,
      whitePov: EvalConvention.toWhitePov(color, parsed),
    };
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

  /** text of the stats block, null if not displayed */
  static readStatsText(): string | null {
    const block = document.querySelector(
      ".cpu-champs-page-graph"
    ) as HTMLElement | null;

    if (!block) {
      return null;
    }

    return block.innerText ?? block.textContent ?? null;
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
   * its tab is open, so the tab is opened for a moment if needed
   */
  static async findInSchedule(
    pick: (rows: ScheduleRowInfo[]) => SchedulePick
  ): Promise<SchedulePick> {
    const rows = this.readScheduleRows();
    if (rows && rows.length > 0) {
      return pick(rows);
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

    scheduleBtn.click();

    try {
      for (let i = 0; i < GameEndConfig.SCHEDULE_PEEK_POLLS; i++) {
        await Utils.sleepAsync(GameEndConfig.SCHEDULE_PEEK_POLL_MS);

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
