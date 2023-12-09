// todo move this to the index.d.ts
type TB_History_entry = {
  [key: number]: lila.mainline_response | lila.standard_response;
};

const chessCurrent = chess_js.chess();
const chessReverse = chess_js.chess();

class GameState {
  // todo delete
  cur = chess_js.chess();
  rev = chess_js.chess();

  constructor() {
    // this.chessCurrent = chess_js.chess();
    // this.chessReverse = chess_js.chess();
  }

  static mainBoardState = {
    fen: "",
    index: -1,
    piecesLeft: -1,
    reset: function () {
      this.fen = "";
      this.index = -1;
      this.piecesLeft = -1;
    },
  };

  static pgnCache: { [key: string]: string[] } = {};

  // todo move this to store
  static TB_Response_History: TB_History_entry = {};
}

// * observers
observeEndOfLoad();
// observeGameEnd();

observeMovePlayed();
observeMoveScrolled();

observeGameStarted();
observeGameEnded();

// * =============
// * observers
function observeEndOfLoad() {
  const mainContentContainer =
    document.querySelector(".cpu-champs-page-main") ?? _DOM_Store.mainContainer;

  ExtensionHelper.messages.sendReady();

  _DOM_Store.scheduleBtn.click();

  if (!mainContentContainer) {
    return;
  }

  const observer = new MutationObserver(() => {
    observer.disconnect();

    onloadHandler();
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

    const gameNumber = await ExtractPageData.getCurrentGameNumber();

    if (!chessCurrent.fields.pgn) return;

    GameState.pgnCache[gameNumber] = chessCurrent.fields.pgn;
  });

  observer.observe(movesDiv, {
    childList: true,
  });
}

function observeGameStarted() {
  const enginePlayer = document.querySelector(
    "#white-player > div"
  ) as HTMLDivElement;

  const observer = new MutationObserver(async () => {
    GameState.mainBoardState.reset();
    CountMaterial.countMaterial(_State.CHESS_STARTING_POSITION.split(" ")[0]);

    const currentGameNumber = await ExtractPageData.getCurrentGameNumber();
    const reverseGameNumber =
      currentGameNumber % 2 === 0
        ? currentGameNumber - 1
        : currentGameNumber + 1;

    chessCurrent.actions.setGameNumber(currentGameNumber);

    if (GameState.pgnCache.hasOwnProperty(reverseGameNumber)) {
      const reverseGame = GameState.pgnCache[reverseGameNumber];

      chessReverse.actions.setPGN(reverseGame);
      chessReverse.actions.setGameNumber(reverseGameNumber);

      HighlightReverse.populateReverse(reverseGame);

      HighlightReverse.findTranspositions();
      HighlightReverse.highlight();
      return;
    }

    const message: message_pass.message = {
      type: "reverse_pgn_request",
      payload: {
        event: _State.currentEventId,
        gameNumber: currentGameNumber,
      },
    };

    // @ts-ignore
    browserPrefix.runtime.sendMessage(message);
  });

  observer.observe(enginePlayer, {
    attributeFilter: ["title"],
  });
}

function observeMoveScrolled() {
  const observer = new MutationObserver(() => {
    observer.disconnect();

    const currentMoveNumber = ExtractPageData.getMoveNumber();

    const currentFEN =
      chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

    if (currentFEN) {
      CountMaterial.countMaterial(currentFEN);
      // requestTBEval(currentMoveNumber, currentFEN);
    } else {
      console.log("FEN is undefined");
    }

    updateShareModalFENInput();

    if (Transpositions.TTList.length !== 0 || Transpositions.sequence > 0) {
      HighlightReverse.highlight();
    }

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

    if (chessReverse.fields.pgn) {
      HighlightReverse.populateReverse(chessReverse.fields.pgn);
    }

    const currentGameNumber = chessCurrent.fields.gameNumber;
    HighlightReverse.updateCurrentPGN();
    HighlightReverse.populateCurrent();

    updateShareModalFENInput()._bind(addListenersToShareFENInput);

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
function getPGNFromCrossTable() {
  const pgnArray: string[] = [];
  const cellsWithMoves: NodeListOf<HTMLTableCellElement> =
    _DOM_Store.movesTable.querySelectorAll("td");

  cellsWithMoves.forEach((cell) => {
    const text = cell.textContent;
    if (!text) return;

    pgnArray.push(utils.removeWhitespace(text));
  });

  const filteredPgnArray = pgnArray.filter((el) => el !== "" && el !== " ");

  return filteredPgnArray;
}

function parseEventLink(eventLink: HTMLAnchorElement) {
  const parsedLink = eventLink.href.split("#")[1];

  if (!parsedLink) return null;

  return parsedLink.replace("event=", "");
}

browserPrefix.runtime.onMessage.addListener(function (
  message: message_pass.message,
  sender,
  senderResponse
) {
  try {
    const { type, payload } = message;

    if (type === "tab_update") {
      const { event, game } = payload;

      _State.tabData.event = event;
      _State.tabData.game = game;

      HighlightReverse.highlightCurrentGame();

      if (!chessReverse.fields.pgn) {
        return;
      }

      HighlightReverse.updateCurrentPGN();
      HighlightReverse.populateReverse(chessReverse.fields.pgn);

      HighlightReverse.findTranspositions();

      return false;
    }

    if (type === "reverse_pgn_response") {
      const { reverseGameNumber, gameNumber, pgn } = payload;
      const event = _State.currentEventId;

      if (!pgn) return;

      chessReverse.actions.clearHistory();
      chessReverse.reset();
      chessReverse.actions.setPGN(pgn);

      GameState.pgnCache[reverseGameNumber] = pgn;

      HighlightReverse.populateReverse(pgn);
      HighlightReverse.findTranspositions();

      return false;
    }

    // senderResponse(true);
  } catch (e: any) {
    console.log(e?.message);
  }
  return true;
});

// todo move this to the other file/class/namespace
// ! ============
// ! ============
function isLargeEval() {
  const evalWrappers: NodeListOf<HTMLDivElement> =
    document.querySelectorAll("#enginedata-eval");

  let largeEval = false;

  evalWrappers.forEach((wrapper) => {
    const evalSpan: HTMLSpanElement = wrapper.querySelector("span")!;

    const evalText = evalSpan.textContent!.toUpperCase();

    if (evalText.includes("M")) {
      largeEval = true;
      return;
    }
  });

  return largeEval;
}

// todo add logic
function requestTBEval(moveNumber: number, currentFen: string) {
  const piecesLeft = CountMaterial.piecesLeft;

  GameState.mainBoardState.fen = currentFen;
  GameState.mainBoardState.index = moveNumber;
  GameState.mainBoardState.piecesLeft = piecesLeft;

  if (piecesLeft <= 7 && false) {
    /**
     * check if eval contains mate score
     */

    if (isLargeEval()) return;

    ExtensionHelper.messages.sendTBEvalRequest(moveNumber + 1);
  }
}

// todo rename/move to _State
function updatePageDataInState() {
  const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  if (!scheduleContainer) {
    return;
  }

  const gameLinks = scheduleContainer.querySelectorAll(".schedule-gameLink");
  const gamesTotalAmount = _DOM_Store.bottomPanel.querySelectorAll(
    ".schedule-container > div"
  ).length;

  let currentGameNumber: number = 0;

  gameLinks.forEach((link, index) => {
    if (link.classList.contains("schedule-inProgress")) {
      currentGameNumber = index + 1;
    }
  });

  const gameInProgress = scheduleContainer.querySelector(
    ".schedule-inProgress"
  );

  _State.pageData.currentGame = currentGameNumber;
  _State.pageData.totalGames = gamesTotalAmount;

  _State.pageData.active = gameInProgress ? true : false;
}

function onloadHandler() {
  // count material onload
  HighlightReverse.updateCurrentPGN();
  HighlightReverse.populateCurrent();

  ExtractPageData.getEventLinks();

  updatePageDataInState();

  const currentFEN = chessCurrent.fields.lastFull;

  if (currentFEN) {
    CountMaterial.countMaterial(currentFEN);
  } else {
    console.log("current fen is undefined");
  }

  queueMicrotask(() => {
    scrollToCurrentGame();
    createGameScheduleLinks();
    requestReversePGN();

    HighlightReverse.highlightCurrentGame();

    if (!chessReverse.fields.pgn) return;

    HighlightReverse.populateReverse(chessReverse.fields.pgn);
    HighlightReverse.findTranspositions();
  });
}

// todo make async? move to extension helper?
function requestReversePGN() {
  // todo delete this
  if (
    _State.pageData.active &&
    _State.pageData.currentGame &&
    _State.pageData.currentGame % 2 === 1
  ) {
    return true;
  }

  const gameNumber = _State.gameNumber;
  // const gameNumber = await ExtractPageData.getCurrentGameNumber()
  const event = _State.currentEventId;

  if (!gameNumber || !event) return true;

  const message: message_pass.message = {
    type: "reverse_pgn_request",
    payload: {
      gameNumber,
      event,
    },
  };

  // @ts-ignore
  browserPrefix.runtime.sendMessage(message);

  return true;
}

function scrollToCurrentGame() {
  const currentGame =
    _DOM_Store.bottomPanel.querySelector(".schedule-inProgress") ??
    _DOM_Store.bottomPanel.querySelector(".ccc-current-game");

  const container: HTMLDivElement | null = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  const lastGame: Element | null = container?.lastElementChild || null;

  if (currentGame) {
    currentGame.scrollIntoView();
  } else if (lastGame) {
    lastGame.scrollIntoView();
  }
}

function createFixedButton(
  cb: undefined | ((...args: any) => any) = undefined
) {
  const btn = document.createElement("button");
  btn.classList.add("dev-fixed-button");

  btn.textContent = "click";

  if (cb !== undefined) {
    btn.addEventListener("click", cb);
  }

  document.body.append(btn);

  return btn;
}

function updateShareModalFENInput() {
  const shareModal = _DOM_Store.mainContainer.querySelector(
    ".ui_modal-component"
  );
  if (!shareModal) return new Maybe(null);

  return new Maybe(shareModal.querySelector(".share-menu-content"))
    ._bind((container) => {
      return container.querySelector(".share-menu-tab-pgn-section");
    })
    ._bind((container) => {
      return container.querySelector("input");
    })
    ._bind((input: HTMLInputElement) => {
      const currentMoveNumber = ExtractPageData.getMoveNumber();
      const fen = chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

      input.value = fen || input.value;

      return input;
    });
}

function addDownloadGameLogsBtn() {
  return new Maybe(document.querySelector(".ui_modal-component"))
    ._bind((modal: HTMLDivElement) => {
      const btn = modal.querySelector(".ccc-download-logs-btn");
      if (btn) return null;

      return modal.querySelector(".share-menu-content");
    })
    ._bind((modalContent: HTMLDivElement) => {
      const menu = modalContent.children[0];

      return menu;
    })
    ._bind(async (container: HTMLDivElement) => {
      const btn = document.createElement("a");

      btn.classList.add("ccc-download-logs-btn");

      btn.textContent = "Download game logs";
      btn.target = "_blank";
      btn.rel = "noopener";

      btn.setAttribute("download", "");

      const archiveLink = container.getAttribute("event-url");
      if (!archiveLink) return container;

      const gameNumber = await ExtractPageData.getCurrentGameNumber();
      const eventId = +archiveLink
        .split("/")
        .filter((el) => {
          const includes = el.includes(".pgn");
          if (!includes) return;
          return el;
        })[0]
        // returns tournament-${tournament-id}.pgn
        .split(".")[0]
        .split("-")[1];

      const link = `https://cccfiles.chess.com/archive/cutechess.debug-${eventId}-${
        eventId + gameNumber
      }.zip`;

      btn.href = link;

      container.append(btn);

      return container;
    });
}

function addListenersToShareFENInput(input: HTMLInputElement) {
  const listenerAdded = input.getAttribute("data-listener-added");

  if (!listenerAdded) {
    input.setAttribute("data-listener-added", "true");

    input.addEventListener("keydown", (e) => {
      if (!e.code.toLowerCase().startsWith("arrow")) return;

      e.stopPropagation();
    });
  }

  return new Maybe(null);
}

// todo change name and add description
class HighlightReverse {
  // todo add description
  static highlight() {
    const movesList = _DOM_Store.movesTable.querySelectorAll("td");

    movesList.forEach((moveElement, index) => {
      if (index < Transpositions.sequence) {
        moveElement.classList.add("ccc-move-agree");
      }
      if (index === Transpositions.sequence) {
        const reverseMove = chessReverse.fields.pgn![index];

        moveElement.classList.add("ccc-test-move");
        moveElement.setAttribute("data-move", reverseMove);
      }
    });

    const ttLen = Transpositions.TTList.length;

    Transpositions.TTList.forEach((tt, ttIndex) => {
      movesList[tt.currentPly].classList.add("ccc-move-agree");

      if (ttLen === ttIndex + 1) {
        const reverseMove = chessReverse.fields.pgn![tt.currentPly + 1];
        const moveElement = movesList[tt.currentPly + 1];

        moveElement.classList.add("ccc-test-move");
        moveElement.setAttribute("data-move", reverseMove);
      }
    });
  }

  static updateCurrentPGN() {
    const pgn = getPGNFromCrossTable();
    chessCurrent.actions.setPGN(pgn);
  }

  // todo add description
  static highlightCurrentGame() {
    const container: HTMLDivElement | null =
      _DOM_Store.bottomPanel.querySelector(".schedule-container");
    const currentGame = _State.tabData.game;

    if (!container) return;

    const highlightedLink = container.querySelector(".ccc-current-game");
    const links = Array.from(container.querySelectorAll(".schedule-gameLink"));

    if (highlightedLink) {
      highlightedLink.classList.remove("ccc-current-game");
    }

    if (!currentGame) return;

    links[currentGame - 1].classList.add("ccc-current-game");
  }

  // TODO rename and rewrite
  // todo move to the chess js class?
  static populateCurrent() {
    chessCurrent.reset();

    chessCurrent.actions.clearHistory();

    const moves = chessCurrent.fields.pgn;

    if (!moves) {
      console.log("empty PGN array");
      return;
    }

    moves.forEach((move) => {
      chessCurrent.mkMove(move);
    });
  }

  // TODO rename and rewrite
  // todo move to the chess js class
  static populateReverse(pgn: string[]) {
    chessReverse.reset();

    chessReverse.actions.clearHistory();

    const moves = pgn;
    if (!moves) {
      console.log("empty reverse PGN array");
      return;
    }

    moves.forEach((move) => {
      chessReverse.mkMove(move);
    });
  }

  static findTranspositions() {
    const currentFenMap: Record<string, number> = {};
    const reverseFenMap: Record<string, number> = {};

    const sequential: number | null = HighlightReverse.calculateSequential();

    if (sequential === null) {
      return;
    }

    Transpositions.reset();

    chessCurrent.fields.FENhistoryTrimmed.forEach((move, index) => {
      currentFenMap[move] = index;
    });

    chessReverse.fields.FENhistoryTrimmed.forEach((move, index) => {
      reverseFenMap[move] = index;
    });

    const keys = utils.objectKeys(currentFenMap);

    keys.forEach((fen) => {
      if (currentFenMap[fen] < sequential) return;

      if (reverseFenMap[fen] !== undefined) {
        Transpositions.TTList.push({
          currentPly: currentFenMap[fen],
          reversePly: reverseFenMap[fen],
          fen: fen,
        });
      }
    });

    Transpositions.sequence = sequential;
  }

  /**
   * todo add description
   */
  static calculateSequential() {
    const curPGN = chessCurrent.fields.pgn;
    const reversePGN = chessReverse.fields.pgn;

    if (!curPGN || !reversePGN) return null;

    let sequel = 0;

    for (let i = 0; i < curPGN.length; i++) {
      if (curPGN[i] !== reversePGN[i]) break;

      sequel++;
    }

    return sequel;
  }
}

// todo
document.addEventListener("visibilitychange", () => {
  const hidden = document.hidden;
});

// todo rename?
class ExtractPageData {
  static async getCurrentGameNumber() {
    if (_State.tabData.game) {
      return Promise.resolve(_State.tabData.game);
    }

    const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
      ".schedule-container"
    );

    if (scheduleContainer) {
      const gameLinks =
        scheduleContainer.querySelectorAll(".schedule-gameLink");
      let gameNumber = 0;

      gameLinks.forEach((link, index) => {
        if (link.classList.contains("schedule-inProgress")) {
          gameNumber = index + 1;
        }
      });

      return Promise.resolve(gameNumber);
    }

    const standingsContainer = document.getElementById("standings-standings");
    if (standingsContainer) {
      const gameNumber = this.gameNumberFromStandings();

      return Promise.resolve(gameNumber);
    }

    const currentTabIndex = this.getPressedButtonIndex();

    await new Promise((res) => {
      res(_DOM_Store.standingsBtn.click());
    });

    const gameNumber = this.gameNumberFromStandings();

    _DOM_Store.tabButtons[currentTabIndex].click();

    return gameNumber;
  }

  static getMoveNumber() {
    const cellList = _DOM_Store.movesTableContainer.querySelectorAll("td");

    let index = -1;

    cellList.forEach((el, i) => {
      if (!el.classList.contains("movetable-highlighted")) return;

      index = i;
    });

    return index;
  }

  /** gets list of an event IDs and pushes them in the state */
  static getEventLinks() {
    const eventNameWrapper: HTMLDivElement =
      _DOM_Store.bottomPanel.querySelector(".bottomtable-event-name-wrapper")!;

    eventNameWrapper.click();

    queueMicrotask(() => {
      const eventsWrapper = _DOM_Store.bottomPanel.querySelector(
        ".bottomtable-resultspopup"
      )!;

      const links = eventsWrapper.querySelectorAll("a");

      links.forEach((link) => {
        const eventName = parseEventLink(link);
        if (!eventName) return;

        _State.eventHrefList.push(eventName);
      });

      eventNameWrapper.click();
    });
  }

  private static gameNumberFromStandings() {
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

    counter = Math.min(counter, _State.pageData.totalGames || counter);

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
}

// todo delete!
// const btn = createFixedButton();
// btn.addEventListener("click", async () => {
//   const gameNumber = await ExtractPageData.getCurrentGameNumber();

//   const message: message_pass.message = {
//     type: "reverse_pgn_request",
//     payload: {
//       event: _State.currentEventId,
//       gameNumber,
//     },
//   };

//   ExtensionHelper.messages.sendMessage(message);
// });

_DOM_Store.scheduleBtn.addEventListener("click", () => {
  const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  )! as HTMLDivElement;

  if (!scheduleContainer) return;

  scrollToCurrentGame();
});
