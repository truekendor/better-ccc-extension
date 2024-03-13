// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtractPageData {
  /**
   *  somewhat reliable way to get current game number from webpage
   */
  static async getCurrentGameNumber(): Promise<number> {
    // to make TS happy
    const tempNumber = _State.gameNumberTab;

    if (tempNumber) {
      return Promise.resolve(tempNumber);
    }

    const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
      ".schedule-container"
    );

    if (scheduleContainer) {
      const gameLinks = scheduleContainer.querySelectorAll(
        ".schedule-game-link"
      );
      let gameNumber = 0;

      gameLinks.forEach((link, index) => {
        if (link.classList.contains("schedule-in-progress")) {
          gameNumber = index + 1;
        }
      });

      return Promise.resolve(gameNumber || gameLinks.length);
    }

    const standingsContainer = document.getElementById("standings-standings");
    if (standingsContainer) {
      const gameNumber = this.getGameNumberFromStandings();
      return Promise.resolve(gameNumber);
    }

    const currentTabIndex = this.getPressedButtonIndex();

    // await microtask
    await new Promise((res) => {
      res(_DOM_Store.standingsBtn.click());
    });

    const gameNumber = this.getGameNumberFromStandings();

    _DOM_Store.tabButtons[currentTabIndex].click();

    return gameNumber;
  }

  // todo delete?
  static getMoveNumber(): number {
    const cellList = _DOM_Store.movesTableContainer.querySelectorAll("td");

    let index = -1;

    cellList.forEach((el, i) => {
      if (!el.classList.contains("movetable-highlighted")) return;

      index = i;
    });

    return index;
  }

  static getPGNFromMoveTable(): string[] {
    const pgnArray: string[] = [];
    const cellsWithMoves: NodeListOf<HTMLTableCellElement> =
      this.getMovesElements();

    cellsWithMoves.forEach((cell) => {
      const text = cell.textContent;
      if (!text) return;

      pgnArray.push(Utils.removeWhitespace(text));
    });

    const filteredPgnArray = pgnArray.filter((el) => el !== "" && el !== " ");

    return filteredPgnArray;
  }

  static getMovesElements(): NodeListOf<HTMLTableCellElement> {
    return _DOM_Store.movesTable.querySelectorAll("td");
  }

  static getGameNumberFromSchedule(scheduleContainer: Element): number {
    const gameLinks = scheduleContainer.querySelectorAll(".schedule-game-link");
    let gameNumber = 0;

    gameLinks.forEach((link, index) => {
      if (link.classList.contains("schedule-in-progress")) {
        gameNumber = index + 1;
      }
    });

    return gameNumber;
  }

  static getGameResultDiv(): Element | null {
    return _DOM_Store.movesTableContainer.querySelector(
      ".movetable-gameResult"
    );
  }

  // todo add mutation observer that will observe childlist
  static async getEventIdWebpage() {
    const eventNameWrapper = _DOM_Store.bottomPanel.querySelector(
      ".bottomtable-event-name-wrapper"
    ) as HTMLDivElement;
    eventNameWrapper.click();

    // ? hacky way of chaining microtasks
    await null;
    const eventsWrapper = _DOM_Store.bottomPanel.querySelector(
      ".bottomtable-resultspopup"
    ) as HTMLDivElement;

    const linkElement = eventsWrapper.querySelector("a");

    if (linkElement) {
      const eventId = linkElement.href.split("#")[1];
      if (eventId) {
        _State.eventIdWebpage = eventId.replace("event=", "");
        createScheduleLinks();
      }
      await null;
    }

    eventNameWrapper.click();
  }

  //  * --------------------------
  //  * private fields
  private static getGameNumberFromStandings(): number {
    const standingsContainer = document.getElementById("standings-standings")!;

    const standingsItem: NodeListOf<HTMLDivElement> =
      standingsContainer.querySelectorAll(".engineitem-list-item");

    let counter = 0;

    standingsItem.forEach((item) => {
      const scoreElement = item.querySelector(".engineitem-score")!;
      const text = scoreElement!.textContent!.trim();

      const score = text.split("/")[1];
      counter += parseInt(score);
    });

    counter /= 2;
    counter += 1;

    counter = Math.min(counter, _State.gamesInTotal || counter);

    return counter;
  }

  /** returns index of a current pressed button (vote/standings/schedule...) */
  private static getPressedButtonIndex(): number {
    const buttons: NodeListOf<HTMLSpanElement> =
      _DOM_Store.tabButtonsContainer.querySelectorAll(".selection-panel-item");
    let selectedBtnIndex = -1;

    buttons.forEach((btn, index) => {
      if (index > 4) return;

      if (btn.classList.contains("selection-panel-selected")) {
        selectedBtnIndex = index;
      }
    });

    return selectedBtnIndex;
  }
}
