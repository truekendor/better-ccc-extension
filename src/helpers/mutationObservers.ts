// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ChessGameObservers {
  static observeAll(): void {
    this.observeGameStarted();
    this.observeGameEnded();
    this.observeMovePlayed();
    this.observeMoveScrolled();
  }

  /**
   * todo add description
   */
  static waitForNewGame(): Promise<void> {
    return new Promise((res) => {
      const observer = new MutationObserver((entries) => {
        if (entries.length < 40) {
          return;
        }
        observer.disconnect();

        Utils.doubleAnimationFrame(res);
      });

      observer.observe(_DOM_Store.movesTable, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  }

  private static observeGameEnded(): void {
    const observer = new MutationObserver(async () => {
      const gameResultDiv = _DOM_Store.movesTableContainer.querySelector(
        ".movetable-gameResult"
      );
      if (!gameResultDiv) {
        return;
      }

      const pgn = ExtractPageData.getPGNFromMoveTable();
      const gameNumber = await ExtractPageData.getCurrentGameNumber();

      ChessGamesCache.cacheFromObject({
        gameNumber,
        pgn,
        type: "full-game",
      });
    });

    observer.observe(_DOM_Store.movesTableContainer, {
      childList: true,
    });
  }

  private static observeGameStarted(): void {
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
      const gameCache = ChessGamesCache.getGame(
        GamePairHelper.getReverseGameNumber(gameNumber)
      );

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
  private static observeMoveScrolled(): void {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      updateShareModalFENInput();

      const currentMoveNumber = ExtractPageData.getMoveNumber();
      const currentFEN =
        chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

      if (currentFEN) {
        CountMaterial.countMaterial(currentFEN);
      }

      HighlightDeviation.highlight();

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

  private static observeMovePlayed(): void {
    const movesTable = _DOM_Store.movesTable;

    const observer = new MutationObserver((e) => {
      if (e.length > 10) {
        return;
      }

      observer.disconnect();
      updateShareModalFENInput()._bind(addListenersToShareFENInput);

      const pgn = ExtractPageData.getPGNFromMoveTable();
      chessCurrent.actions.setPGN(pgn);

      HighlightDeviation.findTranspositionsAndHighlight();

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
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class WebpageObservers {
  static observeEndOfLoad(): Promise<void> {
    const mainContentContainer =
      document.querySelector(".cpu-champs-page-main") ??
      _DOM_Store.mainContainer;

    _DOM_Store.scheduleBtn.click();

    if (!mainContentContainer) {
      const pgn = ExtractPageData.getPGNFromMoveTable();
      if (pgn) {
        return Promise.resolve();
      }

      return ChessGameObservers.waitForNewGame();
    }

    return new Promise((res) => {
      const observer = new MutationObserver(async () => {
        observer.disconnect();

        this.initStateValues();
        this.initMaterialCount();

        await Utils.doubleAnimationFramePromise();

        createGameScheduleLinks();

        const isCurrentGameActive =
          !_DOM_Store.movesTableContainer.querySelector(
            ".movetable-gameResult"
          );

        const queryRemovalNeeded =
          isCurrentGameActive &&
          UserSettings.customSettings.clearQueryStringOnCurrentGame;

        if (queryRemovalNeeded) {
          new ExtensionMessage({
            type: "remove_query",
            payload: null,
          }).sendToBg();
        }

        if (
          isCurrentGameActive &&
          UserSettings.customSettings.highlightReverseDeviation
        ) {
          this.handleOnloadGameCaching();
        }

        this.waitForEventName().then(async (value) => {
          await new Promise((res) => {
            setTimeout(res, 1);
          });

          ExtractPageData.getEventIdWebpage().then(async () => {
            Utils.log(`value: ${value}, eventId: ${_State.eventId}`, "red");
            console.log(`value: ${value}, eventId: ${_State.eventId}`, "red");

            const isMobile = document.querySelector("#cpu-champs-page-ccc");
            if (!isMobile) {
              scrollToCurrentGame();
            }

            if (UserSettings.customSettings.highlightReverseDeviation) {
              ExtensionHelper.messages.requestReverseGame();
            }
          });
        });

        if (chessReverse.fields.pgn) {
          HighlightDeviation.findTranspositionsAndHighlight();
        }

        res();
      });

      observer.observe(mainContentContainer, {
        childList: true,
      });
    });
  }

  private static handleOnloadGameCaching(): void {
    if (!_State.eventId) {
      return;
    }

    const pgn = ExtractPageData.getPGNFromMoveTable();

    ExtractPageData.getCurrentGameNumber().then((gameNumber) => {
      ChessGamesCache.cacheFromObject({
        gameNumber,
        pgn,
        type: "full-game",
      });
    });
  }

  // todo move to other file
  private static initStateValues(): void {
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

    _State.gamesInTotal = gamesTotalAmount;
    _State.isEventActive = gameInProgress;
  }

  // todo move to other file
  private static initMaterialCount(): void {
    const currentFEN =
      chessCurrent.fields.FenHistoryFull[
        chessCurrent.fields.FenHistoryFull.length - 1
      ];
    CountMaterial.countMaterial(currentFEN || ChessJS.trimmedStartPos);
  }

  private static waitForEventName(): Promise<void> {
    return new Promise((res) => {
      const eventNameSpan = _DOM_Store.bottomPanel.querySelector(
        ".bottomtable-eventname > span"
      ) as HTMLSpanElement;

      if (eventNameSpan.textContent) {
        res();
        return;
      }

      const observer = new MutationObserver(() => {
        if (!eventNameSpan.textContent) {
          return;
        }
        observer.disconnect();

        res();

        // setTimeout(() => {
        //   ExtractPageData.getEventIdWebpage().then(() => {
        //     Utils.log(`event id: ${_State.eventId}`, "red");
        //   });
        // }, 500);
      });
      observer.observe(eventNameSpan, {
        characterData: true,
        subtree: true,
      });
    });
  }
}
