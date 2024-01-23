const chessCurrent = chess_js.chess();
const chessReverse = chess_js.chess();

// * =========================
// * observer calls

// todo move to state?
const previousGameState: {
  gameNumber: number;
  pgn: string[];
} = {
  gameNumber: -1,
  pgn: [],
};

observeEndOfLoad();

// * chess game related
observeMovePlayed();
observeMoveScrolled();

observeGameStarted();
observeGameEnded();

// * =========================
// * observers
function observeEndOfLoad() {
  const mainContentContainer =
    document.querySelector(".cpu-champs-page-main") ?? _DOM_Store.mainContainer;

  if (!mainContentContainer) {
    return;
  }

  const observer = new MutationObserver(() => {
    observer.disconnect();
    // todo

    initStateValues();
    initMaterialCount();

    setTimeout(createGameScheduleLinks, 40);

    setTimeout(() => {
      _dev_request_game();

      HighlightReverseDeviation.justDoIt();
    }, 100);
  });

  observer.observe(mainContentContainer, {
    childList: true,
  });
}

function observeGameEnded() {
  const movesDiv = _DOM_Store.movesTableContainer;

  const observer = new MutationObserver(async () => {
    const gameResult = movesDiv.querySelector(".movetable-gameResult");
    if (!gameResult) return;

    {
      const pgn = ExtractPageData.getPGNFromMoveTable();

      previousGameState.gameNumber =
        await ExtractPageData.getCurrentGameNumber();
      previousGameState.pgn.length = 0;
      previousGameState.pgn.push(...pgn);
    }
  });

  observer.observe(movesDiv, {
    childList: true,
  });
}

// todo uncomment
function observeGameStarted() {
  const observer = new MutationObserver(async (entries) => {
    // todo delete comments
    console.log("entries", entries);
    if (document.hidden) return;

    chessReverse.actions.clearFenHistory();
    chessReverse.actions.resetPGN();

    const gameNumber = await ExtractPageData.getCurrentGameNumber();

    // todo delete logs
    if (!isReverseGame(gameNumber, previousGameState.gameNumber)) {
      Utils.log(
        `not a reverse game 
         current gameNumber: ${gameNumber}
         prev gameNumber: ${previousGameState.gameNumber}
      `,
        "pRed"
      );
      return;
    }
    Utils.log(
      `is a reverse game 
      ${gameNumber} 
      ${previousGameState.gameNumber}`,
      "pWhite"
    );

    chessCurrent.actions.setPGN(previousGameState.pgn);
  });

  observer.observe(_DOM_Store.movesTableContainer, {
    childList: true,
  });
}

// moves played/scrolled

function observeMoveScrolled() {
  const observer = new MutationObserver(() => {
    observer.disconnect();
    updateShareModalFENInput();

    const currentMoveNumber = ExtractPageData.getMoveNumber();
    const currentFEN =
      chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

    if (currentFEN) {
      CountMaterial.countMaterial(currentFEN);
    }

    HighlightReverseDeviation.highlight();

    observer.observe(_DOM_Store.movesTable, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  observer.observe(_DOM_Store.movesTable, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}

function observeMovePlayed() {
  const movesTable = _DOM_Store.movesTable;

  const observer = new MutationObserver(() => {
    observer.disconnect();
    updateShareModalFENInput()._bind(addListenersToShareFENInput);

    const pgn = ExtractPageData.getPGNFromMoveTable();
    chessCurrent.actions.setPGN(pgn);
    HighlightReverseDeviation.justDoIt();

    observer.observe(movesTable, {
      childList: true,
      subtree: true,
    });
  });

  observer.observe(movesTable, {
    childList: true,
    subtree: true,
  });
}

// * =============
// * =============
// * ============
browserPrefix.runtime.onMessage.addListener(function (
  message: message_pass.message
  // sender,
  // senderResponse
) {
  try {
    const { type, payload } = message;

    if (type === "response_interceptor") {
      const { details } = payload;
      const cccArchiveURL = "https://cccc.chess.com/archive";

      if (!details.url.startsWith(cccArchiveURL)) {
        return;
      }

      Utils.log("Game PGN received", "green");

      setTimeout(
        () => {
          Utils.log("delayed highlight", "orange");
          HighlightReverseDeviation.justDoIt();
        },
        // todo change this to better metric
        // arbitrary
        1100
      );
    }

    if (type === "tab_update") {
      const { event, game } = payload;

      _State.tabEventId = event;
      _State.gameNumberTab = game;

      if (!chessReverse.fields.pgn) {
        return;
      }

      // todo replace with some logic
      setTimeout(() => {
        HighlightReverseDeviation.justDoIt();
      }, 1500);

      return false;
    }

    if (type === "reverse_pgn_response") {
      const { pgn: reversePGN } = payload;
      const currentPGN = ExtractPageData.getPGNFromMoveTable();

      if (!reversePGN) {
        console.log("reverse PGN is null");
        return;
      }

      chessCurrent.actions.setPGN(currentPGN);
      chessReverse.actions.setPGN(reversePGN);

      return false;
    }

    // senderResponse(true);
  } catch (e: any) {
    console.log(e?.message);
  }
  return true;
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class HighlightReverseDeviation {
  private static sequentialAgreementLength: number = -1;
  private static transpositionList: Array<CustomChess.TranspositionObject> = [];
  private static moveTableElementList: HTMLTableCellElement[] = [];

  // todo add description
  static highlight() {
    const reversePGN = chessReverse.fields.pgn;
    if (!reversePGN) {
      return;
    }

    this.highlightSequential(reversePGN);
    this.highlightTranspositions(reversePGN);
  }

  static findTranspositions() {
    this.resetTranspositions();
    HighlightReverseDeviation.calculateSequential();

    const currentFenMap: Record<string, number> = {};
    const reverseFenMap: Record<string, number> = {};

    if (this.sequentialAgreementLength <= 0) {
      return;
    }

    chessCurrent.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      currentFenMap[fenStr] = index;
    });

    chessReverse.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      reverseFenMap[fenStr] = index;
    });

    const keys = Utils.objectKeys(currentFenMap);

    keys.forEach((fen) => {
      if (currentFenMap[fen] < this.sequentialAgreementLength) return;

      if (reverseFenMap[fen] !== undefined) {
        this.transpositionList.push({
          currentPly: currentFenMap[fen],
          reversePly: reverseFenMap[fen],
          fen: fen,
        });
      }
    });
  }

  // todo delete or rename
  static justDoIt() {
    this.moveTableElementList.length = 0;
    this.moveTableElementList.push(
      ...ExtractPageData.getMovesTableCellElements()
    );

    this.clearMoveTableClasses();
    this.findTranspositions();
    this.highlight();
  }

  static clearMoveTableClasses() {
    const moves = ExtractPageData.getMovesTableCellElements();
    moves.forEach((move) => {
      move.classList.remove("ccc-move-agree");
      move.classList.remove("ccc-data-move");
      move.removeAttribute("data-move");
    });
  }

  private static calculateSequential() {
    const curPGN = chessCurrent.fields.pgn;
    const reversePGN = chessReverse.fields.pgn;

    if (!curPGN || !reversePGN) {
      this.sequentialAgreementLength = -1;
      return;
    }

    let sequel = 0;

    for (let i = 0; i < curPGN.length; i++) {
      if (curPGN[i] !== reversePGN[i]) break;

      sequel++;
    }

    this.sequentialAgreementLength = sequel;
  }

  private static resetTranspositions() {
    this.transpositionList.length = 0;
    this.sequentialAgreementLength = 0;
  }

  private static highlightSequential(reversePGN: readonly string[]): void {
    this.moveTableElementList.forEach((moveElement, index) => {
      if (index < this.sequentialAgreementLength) {
        moveElement.classList.add("ccc-move-agree");
      } else if (index === this.sequentialAgreementLength) {
        const reverseMove = reversePGN![index];

        moveElement.classList.add("ccc-data-move");
        moveElement.setAttribute("data-move", reverseMove);
      }
    });
  }

  private static highlightTranspositions(reversePGN: readonly string[]): void {
    this.transpositionList.forEach((transpositionObject, index) => {
      this.moveTableElementList[transpositionObject.currentPly].classList.add(
        "ccc-move-agree"
      );

      const isLastTransposition = this.transpositionList.length === index + 1;

      if (!isLastTransposition) {
        return;
      }

      const reverseFenIndex = chessReverse.fields.FenHistoryTrimmed.indexOf(
        transpositionObject.fen
      );
      const reverseMove = reversePGN[reverseFenIndex + 1];

      const moveElement =
        this.moveTableElementList[transpositionObject.currentPly + 1];

      moveElement.classList.add("ccc-data-move");
      moveElement.setAttribute("data-move", reverseMove);
    });
  }
}

// todo rename or delete ?
class ExtractPageData {
  /**
   * @todo make it fail if webpage is not in focus
   * @todo move to _State as private method
   * the only ~reliable way to get current game number from webpage
   */
  static async getCurrentGameNumber(): Promise<number> {
    // todo ?
    // if(document.hidden) return Promise.reject('webpage is not in focus')

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

  /**
   * gets list of an event IDs and pushes them in the state
   */
  static getEventLinks() {
    const eventNameWrapper: HTMLDivElement =
      _DOM_Store.bottomPanel.querySelector(".bottomtable-event-name-wrapper")!;

    eventNameWrapper.click();

    queueMicrotask(() => {
      const eventsWrapper = _DOM_Store.bottomPanel.querySelector(
        ".bottomtable-resultspopup"
      )!;

      eventNameWrapper.click();

      const link = eventsWrapper.querySelector("a");
      if (!link) return;

      const eventId = this.parseEventLink(link);

      _State.webpageEventId = eventId;
    });
  }

  static getPGNFromMoveTable(): string[] {
    const pgnArray: string[] = [];
    const cellsWithMoves: NodeListOf<HTMLTableCellElement> =
      this.getMovesTableCellElements();

    cellsWithMoves.forEach((cell) => {
      const text = cell.textContent;
      if (!text) return;

      pgnArray.push(Utils.removeWhitespace(text));
    });

    const filteredPgnArray = pgnArray.filter((el) => el !== "" && el !== " ");

    return filteredPgnArray;
  }

  static getMovesTableCellElements() {
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

    counter = Math.min(counter, _State.totalGamesInTheEvent || counter);

    return counter;
  }

  /** returns index of a current pressed button (vote/standings/schedule...) */
  private static getPressedButtonIndex() {
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

  private static parseEventLink(eventLink: HTMLAnchorElement) {
    const parsedLink = eventLink.href.split("#")[1];

    if (!parsedLink) return null;

    return parsedLink.replace("event=", "");
  }
}

function initStateValues() {
  // update state
  const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  if (!scheduleContainer) {
    return;
  }

  const gamesTotalAmount: number = _DOM_Store.bottomPanel.querySelectorAll(
    ".schedule-container > div"
  ).length;

  const gameInProgress = !!scheduleContainer.querySelector(
    ".schedule-in-progress"
  );

  _State.totalGamesInTheEvent = gamesTotalAmount;
  _State.isEventActive = gameInProgress;
}

function initMaterialCount() {
  const currentFEN = chessCurrent.fields.lastFull;
  CountMaterial.countMaterial(currentFEN || chess_js.trimmedStartPos);
}

// todo delete
function isReverseGame(gameNumber1: number, gameNumber2: number) {
  const diff = Math.abs(gameNumber1 - gameNumber2);

  if (diff !== 1) return false;
  if ((gameNumber1 + gameNumber2 + 1) % 4 !== 0) return false;

  return true;
}

// function createFixedButton() {
//   const btn = document.createElement("button");
//   btn.classList.add("dev-fixed-button");

//   btn.textContent = "click";

//   document.body.append(btn);

//   return btn;
// }

async function _dev_request_game() {
  const gameNumber = await ExtractPageData.getCurrentGameNumber();
  const eventId = _State.eventId;

  if (!eventId) {
    console.log("event id is null");
    return;
  }
  const message: message_pass.message = {
    type: "reverse_pgn_request",
    payload: {
      event: eventId,
      gameNumber: gameNumber,
    },
  };

  ExtensionHelper.messages.sendMessage(message);
}
