const chessCurrent = ChessJS.chess();
const chessReverse = ChessJS.chess();

// * =========================
// * observer calls

observeEndOfLoad();

// * chess game related
observeMovePlayed();
observeMoveScrolled();

observeGameStarted();
observeGameEnded();

// * =========================
// * observers
function observeEndOfLoad(): void {
  const mainContentContainer =
    document.querySelector(".cpu-champs-page-main") ?? _DOM_Store.mainContainer;

  if (!mainContentContainer) {
    return;
  }

  const observer = new MutationObserver(() => {
    observer.disconnect();

    initStateValues();
    initMaterialCount();

    setTimeout(createGameScheduleLinks, 40);

    setTimeout(() => {
      const gameResultDiv = _DOM_Store.movesTableContainer.querySelector(
        ".movetable-gameResult"
      );

      const queryRemovalNeeded =
        !gameResultDiv && UserSettings.custom.clearQueryStringOnCurrentGame;

      if (queryRemovalNeeded) {
        new MessagePass({
          type: "remove_query",
          payload: null,
        }).sendToBg();
      }

      if (gameResultDiv && _State.eventId) {
        const eventId = _State.eventId;
        const pgn = ExtractPageData.getPGNFromMoveTable();

        ExtractPageData.getCurrentGameNumber().then((gameNumber) => {
          ChessGamesCache.cacheFromObject({
            eventId,
            gameNumber,
            pgn,
            type: "full-game",
          });
        });
      }

      _dev_request_game();

      // todo delete this?
      // todo debug and see if this even needed
      if (chessReverse.fields.pgn) {
        FindTranspositions.findTranspositions();
        HighlightReverseDeviation.highlight();
      }
    }, 100);
  });

  observer.observe(mainContentContainer, {
    childList: true,
  });
}

// * -----------------
// *
function observeGameEnded(): void {
  const observer = new MutationObserver(async () => {
    const gameResultDiv = _DOM_Store.movesTableContainer.querySelector(
      ".movetable-gameResult"
    );
    if (!gameResultDiv) {
      return;
    }

    const pgn = ExtractPageData.getPGNFromMoveTable();
    const gameNumber = await ExtractPageData.getCurrentGameNumber();
    const eventId = _State.eventId;

    if (eventId) {
      ChessGamesCache.cacheFromObject({
        eventId,
        gameNumber,
        pgn,
        type: "full-game",
      });
    }
  });

  observer.observe(_DOM_Store.movesTableContainer, {
    childList: true,
  });
}

function observeGameStarted(): void {
  const observer = new MutationObserver(async () => {
    const gameResultDiv = _DOM_Store.movesTableContainer.querySelector(
      ".movetable-gameResult"
    );
    if (gameResultDiv) {
      return;
    }

    FindTranspositions.reset();

    chessCurrent.actions.reset();
    chessReverse.actions.reset();

    const gameNumber = await ExtractPageData.getCurrentGameNumber();

    if (!_State.eventId) {
      return;
    }
    const gameCache = ChessGamesCache.getGame(getReverseGameNumber(gameNumber));

    if (gameCache) {
      chessReverse.actions.setPGN(gameCache.pgn);
      return;
    }
  });

  observer.observe(_DOM_Store.movesTableContainer, {
    childList: true,
  });
}

// * -----------------
// *

function observeMoveScrolled(): void {
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

function observeMovePlayed(): void {
  const movesTable = _DOM_Store.movesTable;

  const observer = new MutationObserver(() => {
    observer.disconnect();
    updateShareModalFENInput()._bind(addListenersToShareFENInput);

    {
      const pgn = ExtractPageData.getPGNFromMoveTable();
      chessCurrent.actions.setPGN(pgn);

      HighlightReverseDeviation.findTranspositionsAndHighlight();
    }
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

      setTimeout(
        () => {
          HighlightReverseDeviation.findTranspositionsAndHighlight();
        },
        // todo change this to better metric
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
        HighlightReverseDeviation.findTranspositionsAndHighlight();
      }, 1500);

      return false;
    }

    if (type === "reverse_pgn_response") {
      const {
        pgn: reversePGN,
        reverseGameNumber,
        eventId,
        // gameNumber,
      } = payload;
      const currentPGN = ExtractPageData.getPGNFromMoveTable();

      if (!reversePGN) {
        console.log("reverse PGN is null");
        return;
      }

      chessCurrent.actions.setPGN(currentPGN);
      chessReverse.actions.setPGN(reversePGN);

      ChessGamesCache.cacheFromObject({
        pgn: reversePGN,
        eventId,
        gameNumber: reverseGameNumber,
        type: "full-game",
      });

      return false;
    }

    // senderResponse(true);
  } catch (e: any) {
    console.log(e?.message);
  }
  return true;
});

class TranspositionEntry {
  public currentPly: number;
  public reversePly: number;
  public fen: string;

  constructor({ currentPly, reversePly, fen }: TranspositionEntry) {
    this.currentPly = currentPly;
    this.reversePly = reversePly;
    this.fen = fen;
  }
}

class TranspositionsObjectPool {
  private index = 0;
  private pool = this.setupTranspositionsList();

  add(obj: TranspositionEntry): void {
    if (this.index === this.pool.length) {
      return;
    }

    this.pool[this.index].currentPly = obj.currentPly;
    this.pool[this.index].reversePly = obj.reversePly;
    this.pool[this.index].fen = obj.fen;

    this.index += 1;
  }

  reset(): void {
    this.pool.forEach((_, index, arr) => {
      arr[index].currentPly = -1;
      arr[index].reversePly = -1;
      arr[index].fen = "";
    });

    this.index = 0;
  }

  get values(): readonly TranspositionEntry[] {
    return this.pool.slice(0, this.index);
  }

  private setupTranspositionsList(): readonly TranspositionEntry[] {
    const arr: readonly TranspositionEntry[] = new Array(100)
      .fill(null)
      .map(() => {
        return new TranspositionEntry({
          currentPly: -1,
          reversePly: -1,
          fen: "",
        });
      });

    return arr;
  }
}

// todo rename?
class FindTranspositions {
  private static sequentialAgreementLength: number = 0;
  private static transpositionsObjectPool = new TranspositionsObjectPool();

  private static currentGameFenMap = new Map<string, number>();
  private static reverseGameFenMap = new Map<string, number>();

  static get agreementLength(): number {
    return this.sequentialAgreementLength;
  }

  static get transpositions(): readonly TranspositionEntry[] {
    return this.transpositionsObjectPool.values;
  }

  static findTranspositions(): void {
    this.reset();
    this.calcSequentialFromPGN();

    if (this.sequentialAgreementLength <= 0) {
      return;
    }

    chessCurrent.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      this.currentGameFenMap.set(fenStr, index);
    });

    chessReverse.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      this.reverseGameFenMap.set(fenStr, index);
    });

    this.currentGameFenMap.forEach((value, fenKey) => {
      if (value < this.sequentialAgreementLength) {
        return;
      }
      const reversePly = this.reverseGameFenMap.get(fenKey);

      if (!this.reverseGameFenMap.has(fenKey) || !reversePly) {
        return;
      }

      const obj = new TranspositionEntry({
        currentPly: value,
        reversePly: reversePly,
        fen: fenKey,
      });

      this.transpositionsObjectPool.add(obj);
    });
  }

  static reset(): void {
    this.currentGameFenMap.clear();
    this.reverseGameFenMap.clear();

    this.transpositionsObjectPool.reset();

    this.sequentialAgreementLength = 0;
  }

  private static calcSequentialFromPGN(): void {
    const currentPGN = chessCurrent.fields.pgn;
    const reversePGN = chessReverse.fields.pgn;

    if (!currentPGN || !reversePGN) {
      this.sequentialAgreementLength = -1;
      return;
    }

    let sequel = 0;

    for (let i = 0; i < currentPGN.length; i++) {
      if (currentPGN[i] !== reversePGN[i]) {
        break;
      }

      sequel++;
    }

    this.sequentialAgreementLength = sequel;
  }
}

class HighlightReverseDeviation {
  private static moveTableElementList: HTMLTableCellElement[] = [];

  // todo add description
  static highlight(): void {
    // todo change this
    if (FindTranspositions.agreementLength < 16) return;
    if (!chessReverse.fields.pgn || chessReverse.fields.pgn.length < 20) {
      return;
    }

    this.highlightSequential();
    this.highlightTranspositions();
  }

  // todo add description
  static findTranspositionsAndHighlight(): void {
    this.clearMoveTableClasses();

    this.moveTableElementList.length = 0;
    this.moveTableElementList.push(...ExtractPageData.getMovesElements());

    FindTranspositions.findTranspositions();
    this.highlight();
  }

  private static clearMoveTableClasses(): void {
    const moves = ExtractPageData.getMovesElements();

    moves.forEach((move) => {
      move.classList.remove("ccc-move-agree");
      move.classList.remove("ccc-data-move");
      move.removeAttribute("data-move");
    });
  }

  private static highlightSequential(): void {
    const reversePGN = chessReverse.fields.pgn;

    this.moveTableElementList.forEach((moveElement, index) => {
      if (index < FindTranspositions.agreementLength) {
        moveElement.classList.add("ccc-move-agree");
      } else if (index === FindTranspositions.agreementLength) {
        const reverseMove = reversePGN![index];

        moveElement.classList.add("ccc-data-move");
        moveElement.setAttribute("data-move", reverseMove);
      }
    });
  }

  private static highlightTranspositions(): void {
    FindTranspositions.transpositions.forEach((transpositionObject, index) => {
      this.moveTableElementList[transpositionObject.currentPly].classList.add(
        "ccc-move-agree"
      );

      const isLastTransposition =
        FindTranspositions.transpositions.length === index + 1;

      if (!isLastTransposition) {
        return;
      }

      const reverseFenIndex = chessReverse.fields.FenHistoryTrimmed.indexOf(
        transpositionObject.fen
      );
      const reverseMove = chessReverse.fields.pgn![reverseFenIndex + 1];

      const moveElement =
        this.moveTableElementList[transpositionObject.currentPly + 1];

      if (!moveElement) return;

      const moveNumber = (reverseFenIndex + (reverseFenIndex % 2)) / 2 + 1;

      moveElement.title = `Deviated at ${moveNumber}. ${
        reverseFenIndex % 2 === 1 ? " " : " .."
      }${reverseMove}`;

      moveElement.classList.add("ccc-data-move");
      moveElement.setAttribute("data-move", reverseMove);
    });
  }
}

// todo rename
class ExtractPageData {
  /**
   * @todo make it fail if webpage is not in focus
   * @todo move to _State as private method?
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
   * todo redo/name
   * sets latest event id from web pages event list to state
   */
  static setEventIdToState(): void {
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

  private static parseEventLink(eventLink: HTMLAnchorElement): string | null {
    const parsedLink = eventLink.href.split("#")[1];

    if (!parsedLink) return null;

    return parsedLink.replace("event=", "");
  }
}

function initStateValues(): void {
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

function initMaterialCount(): void {
  const currentFEN =
    chessCurrent.fields.FenHistoryFull[
      chessCurrent.fields.FenHistoryFull.length - 1
    ];
  CountMaterial.countMaterial(currentFEN || ChessJS.trimmedStartPos);
}

function getReverseGameNumber(currentGameNumber: number): number {
  const offset = currentGameNumber % 2 === 0 ? -1 : 1;

  return currentGameNumber + offset;
}

// todo delete?
async function _dev_request_game(): Promise<void> {
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

// todo move to index.d.ts
type GameCacheEntry = {
  pgn: string[];
  type: "intermediate-cache" | "full-game";
};

class ChessGamesCache {
  // ? cache structure example:
  // {
  //  ---- game number ----
  //   22: {
  //       pgn: ['e4', 'e5', ...]
  //       type: 'full-game'
  //     },
  //   45: {
  //       pgn: ['g4', 'd5', ...]
  //       type: 'intermediate-cache'
  //     }
  // }
  // todo make private
  static cache = new Map<number, GameCacheEntry>();
  private static currentEventId: string;

  static async cacheCurrent(): Promise<void> {
    const pgn = ExtractPageData.getPGNFromMoveTable();
    const gameNumber = await ExtractPageData.getCurrentGameNumber();
    const eventId = _State.eventId;

    if (!eventId) return;

    ChessGamesCache.cacheFromObject({
      eventId,
      gameNumber,
      pgn,
      type: "full-game",
    });
  }

  static cacheFromObject({
    eventId,
    gameNumber,
    pgn,
    type,
  }: {
    gameNumber: number;
    eventId: string;
    pgn: string[];
    type: GameCacheEntry["type"];
  }): void {
    if (this.currentEventId !== eventId) {
      this.currentEventId = eventId;
      this.cache.clear();
    }

    this.cache.set(gameNumber, {
      type,
      pgn,
    });
  }

  static getGame(gameNumber: number): GameCacheEntry | null {
    if (!this.currentEventId) {
      return null;
    }

    if (!this.cache.has(gameNumber)) {
      return null;
    }

    return this.cache.get(gameNumber)!;
  }
}
