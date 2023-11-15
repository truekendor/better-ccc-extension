// todo move this to the index.d.ts
type TB_History_entry = {
  [key: number]: lila.mainline_response | lila.standard_response;
};

// todo move this to store
const TB_Response_History: TB_History_entry = {};
const mainBoardState = {
  fen: "",
  index: -1,
  piecesLeft: -1,
};

const chessCurrent = chess_js.chess();
const chessReverse = chess_js.chess();

// * observers
observeEndOfLoad();
// observeGameEnd();

observeMovePlayed();
observeMoveScrolled();

observeGameStarted();
observeGameEnded();

observeShareModal();

// * =============
// * observers
function observeEndOfLoad() {
  const mainContentContainer =
    document.querySelector(".cpu-champs-page-main") ?? _DOM_Store.mainContainer;

  sendReadyToBg();

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

  const observer = new MutationObserver((e) => {
    const gameResult = _DOM_Store.movesTableContainer.querySelector(
      ".movetable-gameResult"
    );
    const nextGameTimer = _DOM_Store.movesTableContainer.querySelector(
      ".next-game-clock-wrapper"
    );

    if (!gameResult || nextGameTimer) return;

    const event = getCurrentEventFromStore();
    const game = getCurrentGameFromStore();
    // const pgn = CurrentGame.fields.pgn;
    const pgn = chessCurrent.fields.pgn;
    const totalGames = _State.pageData.totalGames;

    if (!event || !game || !pgn || !totalGames) return;

    if (
      _State.pageData.currentGame &&
      _State.pageData.currentGame < totalGames &&
      !_State.tabData.game
    ) {
      _State.pageData.currentGame += 1;
    }
  });

  observer.observe(movesDiv, {
    childList: true,
  });
}

function observeGameStarted() {
  const table = _DOM_Store.movesTable;

  let gameNumber = getCurrentGameFromStore();

  const observer = new MutationObserver(() => {
    if (gameNumber !== getCurrentGameFromStore()) {
      gameNumber = getCurrentGameFromStore();

      console.log("game started", gameNumber);
      console.log("game started", gameNumber);
    }
  });

  observer.observe(table, {
    childList: true,
  });
}

function observeMoveScrolled() {
  const observer = new MutationObserver(() => {
    observer.disconnect();

    const currentMoveNumber = getMoveNumber();

    const currentFEN =
      chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

    if (currentFEN) {
      CountPieces.countMaterial(currentFEN);
      requestTBEval(currentMoveNumber, currentFEN);
    } else {
      console.log("FEN is undefined");
    }

    updateShareModalFENInput();

    if (Transpositions.TTList.length !== 0 || Transpositions.sequence > 0) {
      highlight();
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

    updateCurrentPGN();
    addEntriesToFENHistory();

    updateShareModalFENInput()._bind(addListenersToShareFENInput);
    highlight();

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

function observeShareModal() {
  const observer = new MutationObserver(() => {
    updateShareModalFENInput()._bind(addListenersToShareFENInput);
    addDownloadGameLogsBtn();
  });

  observer.observe(_DOM_Store.mainContainer, {
    childList: true,
  });
}

// * =============
// * =============

// todo move to the page state
function getCurrentGameFromStore() {
  return (
    _State.tabData.game ??
    _State.pageData.currentGame ??
    _State.pageData.totalGames
  );
}

// todo move to the page state
function getCurrentEventFromStore() {
  return _State.tabData.event || _State.eventHrefList[0];
}

// * ============
function getPGNFromCrossTable() {
  const pgnArray: string[] = [];
  const cellsWithMoves: NodeListOf<HTMLTableCellElement> =
    _DOM_Store.movesTable.querySelectorAll("td");

  cellsWithMoves.forEach((cell) => {
    const text = cell.textContent;
    if (!text) return;

    pgnArray.push(dom_helpers.removeWhitespace(text));
  });

  const filteredPgnArray = pgnArray.filter((el) => el !== "" && el !== " ");

  return filteredPgnArray;
}

function parseEventLink(eventLink: HTMLAnchorElement) {
  const parsedLink = eventLink.href.split("#")[1];

  if (!parsedLink) return null;

  return parsedLink.replace("event=", "");
}

/** sends ready to BG script on document load */
function sendReadyToBg() {
  const message: message_pass.message = {
    type: "onload",
    payload: null,
  };

  // @ts-ignore
  browserPrefix.runtime.sendMessage(message);

  return true;
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

      highlightCurrentGame();

      if (!chessReverse.fields.pgn) {
        console.log("Empty pgn");
        return;
      }

      updateCurrentPGN();
      populateReverse(chessReverse.fields.pgn);

      findTranspositions();
    }

    if (type === "reverse_pgn_response") {
      const { reverseGameNumber, gameNumber, pgn } = payload;
      const event = getCurrentEventFromStore();

      if (!pgn) return;

      chessReverse.actions.setPGN(pgn);
    }

    senderResponse(true);

    return true;
  } catch (e: any) {
    console.log(e?.message);
  }
  return true;
});

/**
 * Requests TB eval for current position */
function sendTBEvalRequest(ply: number) {
  const fenString = chessCurrent.actions.getFullFenAtIndex(ply);

  if (!fenString) return false;

  const message: message_pass.message = {
    type: "request_tb_eval",
    payload: {
      fen: fenString[ply - 1]!.split(" ").join("_"),
      currentPly: ply,
    },
  };

  if (!TB_Response_History[ply]) {
    browserPrefix.runtime
      // @ts-ignore
      .sendMessage(message)
      .then((response: message_pass.message) => {
        const { type, payload } = response;

        if (
          type !== "response_tb_standard" ||
          !payload.response ||
          typeof payload.response === "string"
        ) {
          return;
        }

        TB_Response_History[payload.ply] = payload.response;
      });
  }

  return true;
}

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

// todo append this panel to the toolbar ?
// createRequestTBEvalPanel();
function createRequestTBEvalPanel() {
  const panel = document.createElement("div");
  const currentFENSpan = document.createElement("span");
  const requestTBEvalButton = document.createElement("button");

  panel.classList.add("ccc-eval-panel");
  currentFENSpan.textContent = `FEN:  ${mainBoardState.fen}`;

  requestTBEvalButton.textContent = "Request TB Eval";

  panel.appendChild(currentFENSpan);
  panel.appendChild(requestTBEvalButton);

  document.body.appendChild(panel);
}

// todo add logic
function requestTBEval(moveNumber: number, currentFen: string) {
  const piecesLeft = CountPieces.piecesLeft;

  mainBoardState.fen = currentFen;
  mainBoardState.index = moveNumber;
  mainBoardState.piecesLeft = piecesLeft;

  if (piecesLeft <= 7 && false) {
    /**
     * check if eval contains mate score
     */

    if (isLargeEval()) return;

    sendTBEvalRequest(moveNumber + 1);
  }
}

function getMoveNumber() {
  const cellList = _DOM_Store.movesTableContainer.querySelectorAll("td");

  let index = -1;

  cellList.forEach((el, i) => {
    if (!el.classList.contains("movetable-highlighted")) return;

    index = i;
  });

  return index;
}

// TODO rename and rewrite
function addEntriesToFENHistory() {
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

function getGameNumberFromSchedule() {
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

  const currentGameNumber: number = gameLinks.length;

  const gameInProgress = scheduleContainer.querySelector(
    ".schedule-inProgress"
  );

  _State.pageData.currentGame = currentGameNumber;
  _State.pageData.totalGames = gamesTotalAmount;

  _State.pageData.active = gameInProgress ? true : false;
}

function updateCurrentPGN() {
  const pgn = getPGNFromCrossTable();
  chessCurrent.actions.setPGN(pgn);
}

function getEventLinks() {
  const eventNameWrapper: HTMLDivElement = _DOM_Store.bottomPanel.querySelector(
    ".bottomtable-event-name-wrapper"
  )!;

  eventNameWrapper.click();

  queueMicrotask(() => {
    const eventsWrapper = _DOM_Store.bottomPanel.querySelector(
      ".bottomtable-resultspopup"
    )!;

    const links = eventsWrapper.querySelectorAll("a");

    if (links.length > 0) {
      links.forEach((link) => {
        const eventName = parseEventLink(link);
        if (!eventName) return;

        _State.eventHrefList.push(eventName);
      });

      eventNameWrapper.click();
    } else {
      // wait for the event entries
      const observer = new MutationObserver((mutations) => {
        if (mutations.length < 100) return;

        observer.disconnect();

        const links = eventsWrapper.querySelectorAll("a");
        links.forEach((link) => {
          const eventName = parseEventLink(link);
          if (!eventName) return;

          _State.eventHrefList.push(eventName);
        });

        eventNameWrapper.click();
      });

      observer.observe(eventsWrapper, {
        childList: true,
      });
    }
  });
}

function onloadHandler() {
  // count material onload
  updateCurrentPGN();

  addEntriesToFENHistory();
  getEventLinks();

  getGameNumberFromSchedule();

  const currentFEN = chessCurrent.fields.lastFull;

  if (currentFEN) {
    CountPieces.countMaterial(currentFEN);
  } else {
    console.log("current fen is undefined");
  }

  queueMicrotask(() => {
    scrollToCurrentGame();
    createGameScheduleLinks();
    requestReversePGN();

    highlightCurrentGame();

    if (!chessReverse.fields.pgn) return;

    populateReverse(chessReverse.fields.pgn);
    findTranspositions();
  });
}

function requestReversePGN() {
  if (
    _State.pageData.active &&
    _State.pageData.currentGame &&
    _State.pageData.currentGame % 2 === 1
  ) {
    return true;
  }

  const gameNumber = getCurrentGameFromStore();
  const event = getCurrentEventFromStore();

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

// createFixedButton();
function createFixedButton() {
  const btn = document.createElement("button");
  btn.classList.add("dev-fixed-button");

  btn.textContent = "click";

  btn.append(dom_helpers.SVG.icons.gear);

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
      const currentMoveNumber = getMoveNumber();
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

      return modal;
    })
    ._bind((modal: HTMLDivElement) => {
      return modal.querySelector(".share-menu-content");
    })
    ._bind((modalContent: HTMLDivElement) => {
      const menu = modalContent.children[0];

      return menu;
    })
    ._bind((container: HTMLDivElement) => {
      const btn = document.createElement("button");

      btn.classList.add("ccc-download-logs-btn");
      btn.textContent = "Download game logs";
      btn.type = "button";
      btn.setAttribute("target", "_blank");
      btn.setAttribute("rel", "noopener");
      btn.setAttribute("download", "");

      const archiveLink = container.getAttribute("event-url");
      if (!archiveLink) return container;

      const linkBaseline =
        "https://cccfiles.chess.com/archive/cutechess.debug-345754-345755.zip";

      const eventId = archiveLink
        .split("/")
        .filter((el) => {
          const includes = el.includes(".pgn");
          if (!includes) return;
          return el;
        })[0]
        // returns tournament-${someNumber}.pgn
        .split(".")[0]
        .split("-")[1];

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

function populateReverse(pgn: string[]) {
  chessReverse.reset();

  const moves = pgn;

  moves.forEach((move) => {
    chessReverse.mkMove(move);

    chessReverse.actions.addToFull(chessReverse.FEN_FULL);
    chessReverse.actions.addToTrimmed(chessReverse.FEN_TRIMMED);
  });
}

function findTranspositions() {
  const currentFenMap: Record<string, number> = {};
  const reverseFenMap: Record<string, number> = {};

  const sequential: number | null = calculateSequential();

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

  const keys = Object.keys(currentFenMap) as Array<
    keyof Record<string, number>
  >;

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
function calculateSequential() {
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

// todo add description
function highlight() {
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

function highlightCurrentGame() {
  const container: HTMLDivElement | null = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );
  const currentGame = _State.tabData.game;

  if (!container || !currentGame) return;

  const highlightedLink = container.querySelector(".ccc-current-game");
  const links = Array.from(container.querySelectorAll(".schedule-gameLink"));

  if (highlightedLink) {
    highlightedLink.classList.remove("ccc-current-game");
  }

  links[currentGame - 1].classList.add("ccc-current-game");
}

// todo
document.addEventListener("visibilitychange", () => {
  const hidden = document.hidden;
});
