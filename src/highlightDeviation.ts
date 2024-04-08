const chessCurrent = ChessJS.chess();
const chessReverse = ChessJS.chess();

// * =========================
// * observers

WebpageObservers.observeEndOfLoad();
ChessGameObservers.observeAll();

// * =============
// *

class OnMessageHandlers {
  static async tabUpdateHandler(message: message_pass.message): Promise<void> {
    if (
      !UserSettings.customSettings.highlightReverseDeviation ||
      message.type !== "tab_update"
    ) {
      return;
    }

    const { payload } = message;
    const { event, game: tempGameNumber } = payload;

    _State.eventIdTab = event;
    _State.gameNumberTab = tempGameNumber;

    const gameNumber = (await new Promise((res) => {
      if (tempGameNumber) {
        res(tempGameNumber);
      } else {
        ExtractPageData.getCurrentGameNumber().then((gameNumber) =>
          res(gameNumber)
        );
      }
    })) as number;

    const reverseGameCache = ChessGamesCache.getGame(
      GamePairHelper.getReverseGameNumber(gameNumber)
    );

    if (!reverseGameCache) {
      chessCurrent.actions.reset();
      chessReverse.actions.reset();

      HighlightDeviation.clearHighlight();

      ExtensionHelper.messages.requestReverseFor(gameNumber);

      return;
    }
    chessReverse.actions.setPGN(reverseGameCache.pgn);

    ChessGameObservers.waitForNewGame().then(() => {
      if (reverseGameCache) {
        HighlightDeviation.findTranspositionsAndHighlight();
      }
    });
  }

  static pgnResponseHandler(message: message_pass.message): void {
    if (
      !UserSettings.customSettings.highlightReverseDeviation ||
      message.type !== "reverse_pgn_response"
    ) {
      return;
    }
    const { payload } = message;

    const {
      pgn: reversePGN,
      reverseGameNumber,
      // gameNumber,
    } = payload;

    const currentPGN = ExtractPageData.getPGNFromMoveTable();

    if (!reversePGN) {
      console.log(
        "OnMessageHandlers::pgnResponse handler:\nreverse pgn is null"
      );
      return;
    }

    chessCurrent.actions.setPGN(currentPGN);
    chessReverse.actions.setPGN(reversePGN);

    HighlightDeviation.findTranspositionsAndHighlight();

    ChessGamesCache.cacheFromObject({
      pgn: reversePGN,
      gameNumber: reverseGameNumber,
      type: "full-game",
    });
  }
}

browserPrefix.runtime.onMessage.addListener(function (
  message: message_pass.message
  // sender,
  // senderResponse
) {
  try {
    const { type } = message;

    if (type === "tab_update") {
      OnMessageHandlers.tabUpdateHandler(message);
      return false;
    } else if (type === "reverse_pgn_response") {
      OnMessageHandlers.pgnResponseHandler(message);
      return false;
    }
  } catch (e: any) {
    console.log(e?.message);
  }
  return true;
});

class HighlightDeviation {
  private static moveTableElementList: HTMLTableCellElement[] = [];

  // todo add description
  static highlight(): void {
    if (!UserSettings.customSettings.highlightReverseDeviation) {
      return;
    }
    if (ExtractPageData.isMobile) {
      return;
    }

    // todo change this
    if (FindTranspositions.agreementLength < 16) return;
    if (!chessReverse.fields.pgn || chessReverse.fields.pgn.length < 20) {
      return;
    }

    this.highlightSequential();
    this.highlightTranspositions();
  }

  // todo add description
  static findTranspositionsAndHighlight(debugMessage = ""): void {
    if (!UserSettings.customSettings.highlightReverseDeviation) {
      return;
    }
    if (ExtractPageData.isMobile) {
      return;
    }

    if (debugMessage) {
      console.log(`find & highlight: ${debugMessage}`);
    }

    this.clearHighlight();

    this.moveTableElementList.length = 0;
    this.moveTableElementList.push(...ExtractPageData.getMovesElements());

    FindTranspositions.find(chessCurrent, chessReverse);

    this.highlight();
  }

  static clearHighlight(): void {
    const moves = ExtractPageData.getMovesElements();

    moves.forEach((move) => {
      if (move.getAttribute("title")) {
        move.removeAttribute("title");
      }
      move.classList.remove("ccc-move-agree");
      move.classList.remove("ccc-data-move");
      move.removeAttribute("data-move");
    });
  }

  private static highlightSequential(): void {
    const reversePGN = chessReverse.fields.pgn;

    this.moveTableElementList.forEach((moveElement, index) => {
      if (index < FindTranspositions.agreementLength) {
        moveElement.title = "same move as in the reverse game";
        moveElement.classList.add("ccc-move-agree");
      } else if (index === FindTranspositions.agreementLength) {
        const reverseMove = reversePGN![index];
        moveElement.title = `move played in the reverse game: ${reverseMove}`;

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
      this.moveTableElementList[transpositionObject.currentPly].title =
        "transposition";

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

(function awaitNewGameGlobal(): void {
  const observer = new MutationObserver(async (entries) => {
    if (ExtractPageData.isMobile) {
      return;
    }

    // arbitrary large amount
    if (entries.length < 30) {
      return;
    }

    HighlightDeviation.clearHighlight();

    // do not delete lol
    await new Promise((res) => {
      requestAnimationFrame(() => {
        res(null);
      });
    });
    await Utils.sleepAsync(1);

    CountCapturedPieces.clear();

    const gameNumber = await ExtractPageData.getCurrentGameNumber();
    const reverseGameNumber = GamePairHelper.getReverseGameNumber(gameNumber);

    const reverseGameCache = ChessGamesCache.getGame(reverseGameNumber);

    const currentPGN = ExtractPageData.getPGNFromMoveTable();

    const gameAlreadyInCache = ChessGamesCache.getGame(gameNumber);
    if (!gameAlreadyInCache) {
      if (ExtractPageData.getGameResultDiv()) {
        ChessGamesCache.cacheFromObject({
          gameNumber,
          pgn: currentPGN,
          type: "full-game",
        });
      }
    }

    if (!reverseGameCache) {
      return;
    }

    chessCurrent.actions.reset();
    chessReverse.actions.reset();
    chessCurrent.actions.setPGN(currentPGN);
    chessReverse.actions.setPGN(reverseGameCache.pgn);

    DebugPanel.print(`await new game global::highlight`);
    HighlightDeviation.findTranspositionsAndHighlight();
  });

  observer.observe(_DOM_Store.movesTable, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();

// todo rewrite with this
// window.addEventListener("hashchange", (e) => {
//   console.log("e", e);
// });
