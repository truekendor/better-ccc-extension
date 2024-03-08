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
      !UserSettings.custom.highlightReverseDeviation ||
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
      GameNumberHelper.getReverseGameNumber(gameNumber)
    );

    if (!reverseGameCache) {
      chessCurrent.actions.reset();
      chessReverse.actions.reset();

      HighlightReverseDeviation.clearMoveTableClasses();

      ExtensionHelper.messages.requestReverseFor(gameNumber);

      return;
    }
    chessReverse.actions.setPGN(reverseGameCache.pgn);

    ChessGameObservers.waitForNewGame().then(() => {
      if (reverseGameCache) {
        HighlightReverseDeviation.findTranspositionsAndHighlight();
      }
    });
  }

  static pgnResponseHandler(message: message_pass.message): void {
    if (
      !UserSettings.custom.highlightReverseDeviation ||
      message.type !== "reverse_pgn_response"
    ) {
      return;
    }
    const { payload } = message;

    const {
      pgn: reversePGN,
      reverseGameNumber,
      eventId,
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

    HighlightReverseDeviation.findTranspositionsAndHighlight();

    ChessGamesCache.cacheFromObject({
      pgn: reversePGN,
      eventId,
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class HighlightReverseDeviation {
  private static moveTableElementList: HTMLTableCellElement[] = [];

  // todo add description
  static highlight(): void {
    if (!UserSettings.custom.highlightReverseDeviation) {
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
    if (!UserSettings.custom.highlightReverseDeviation) {
      return;
    }

    if (debugMessage) {
      console.log(`find & highlight: ${debugMessage}`);
    }

    this.clearMoveTableClasses();

    this.moveTableElementList.length = 0;
    this.moveTableElementList.push(...ExtractPageData.getMovesElements());

    FindTranspositions.find(chessCurrent, chessReverse);
  }

  static clearMoveTableClasses(): void {
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
    if (entries.length < 40) {
      return;
    }

    await Utils.doubleAnimationFramePromise();

    const gameNumber = await ExtractPageData.getCurrentGameNumber();
    const reverseGameNumber = GameNumberHelper.getReverseGameNumber(gameNumber);

    const reverseGameCache = ChessGamesCache.getGame(reverseGameNumber);

    const currentPGN = ExtractPageData.getPGNFromMoveTable();

    console.log("game number", gameNumber, "reverse", reverseGameNumber);
    console.log("reverse game cache", reverseGameCache);

    const gameAlreadyInCache = ChessGamesCache.getGame(gameNumber);
    if (!gameAlreadyInCache) {
      if (ExtractPageData.getGameResultDiv()) {
        ChessGamesCache.cacheFromObject({
          eventId: _State.eventId!,
          gameNumber,
          pgn: currentPGN.concat(),
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

    HighlightReverseDeviation.findTranspositionsAndHighlight();
  });

  observer.observe(_DOM_Store.movesTable, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
