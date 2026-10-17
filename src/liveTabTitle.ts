/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

/**
 * prefixes the browser tab title with the last move of the
 * displayed game (`34. Nf3`, `34… Rxe5`) or with its result (`1-0`),
 * so the game can be followed from another tab
 *
 * controlled by the `liveTabTitle` setting
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class LiveTabTitle {
  /** title set by chess.com, without our prefix */
  private static baseTitle = document.title;
  /** last title written by this class */
  private static appliedTitle: string | null = null;
  private static timerId = -1;

  static init(): void {
    const movesObserver = new MutationObserver(() => this.scheduleUpdate());
    movesObserver.observe(_DOM_Store.movesTableContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // keeps `baseTitle` in sync if the page changes its own title
    const titleObserver = new MutationObserver(() => {
      if (document.title === this.appliedTitle) return;

      this.baseTitle = document.title;
      this.appliedTitle = null;
      this.scheduleUpdate();
    });
    titleObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.scheduleUpdate();
  }

  /** applies the current setting immediately */
  static update(): void {
    clearTimeout(this.timerId);

    if (!UserSettings.customSettings.liveTabTitle) {
      this.restore();
      return;
    }

    let prefix = "";
    try {
      prefix = this.getPrefix();
    } catch (e) {
      Utils.logError(e);
    }

    const title = prefix ? `${prefix} · ${this.baseTitle}` : this.baseTitle;

    if (document.title === title) return;

    this.appliedTitle = title;
    document.title = title;
  }

  private static restore(): void {
    if (this.appliedTitle === null) return;

    this.appliedTitle = null;
    document.title = this.baseTitle;
  }

  private static scheduleUpdate(): void {
    clearTimeout(this.timerId);
    this.timerId = setTimeout(() => this.update(), 150);
  }

  private static getPrefix(): string {
    const resultDiv = ExtractPageData.getGameResultDiv();
    if (resultDiv) {
      return this.formatResult(resultDiv.textContent ?? "");
    }

    const moves = ExtractPageData.getPGNFromMoveTable();
    const ply = moves.length;
    if (ply === 0) return "";

    const moveNumber = Math.ceil(ply / 2);
    const lastMove = moves[ply - 1];
    const isWhiteMove = ply % 2 === 1;

    return isWhiteMove
      ? `${moveNumber}. ${lastMove}`
      : `${moveNumber}… ${lastMove}`;
  }

  private static formatResult(text: string): string {
    const match = /1\/2-1\/2|½-½|1-0|0-1/.exec(Utils.removeWhitespace(text));

    if (!match) return "Game over";

    return match[0] === "1/2-1/2" ? "½-½" : match[0];
  }
}

LiveTabTitle.init();
