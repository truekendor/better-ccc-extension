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
      const observer = new MutationObserver(async (entries) => {
        if (entries.length < 40) {
          return;
        }
        observer.disconnect();

        res();
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

      if (ExtractPageData.isMobile) {
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
      if (ExtractPageData.isMobile) {
        return;
      }
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
      ShareModal.updateFEN();

      const currentMoveNumber = ExtractPageData.getMoveNumber();
      const currentFEN =
        chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

      if (currentFEN) {
        CountCapturedPieces.count(currentFEN);
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
      ShareModal.updateFENAndListen();

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

        createScheduleLinks();

        const isCurrentGameActive =
          !_DOM_Store.movesTableContainer.querySelector(
            ".movetable-gameResult"
          );

        const removeTabHashQuery =
          isCurrentGameActive &&
          UserSettings.customSettings.clearQueryStringOnCurrentGame;

        if (removeTabHashQuery) {
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

        const isMobile = document.querySelector("#cpu-champs-page-ccc");
        if (isMobile) {
          components.Webpage.crTwitchChatExpandBtn();
        }

        this.waitForEventName().then(async () => {
          await Utils.sleepAsync(25);

          await Utils.retry({
            cb: this.endOfLoadHandler,
            retryCount: 3,
            retryWaitTime: 500,
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

  private static async endOfLoadHandler() {
    await ExtractPageData.getEventId();

    if (!_State.eventId) {
      return false;
    }

    const isMobile = document.querySelector("#cpu-champs-page-ccc");
    if (!isMobile) {
      scrollToCurrentGame();
    }

    if (UserSettings.customSettings.highlightReverseDeviation) {
      ExtensionHelper.messages.requestReverseGame();
    }

    return true;
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

  private static initMaterialCount(): void {
    const currentFEN =
      chessCurrent.fields.FenHistoryFull[
        chessCurrent.fields.FenHistoryFull.length - 1
      ];
    CountCapturedPieces.count(currentFEN || ChessJS.trimmedStartPos);
  }

  private static waitForEventName(): Promise<void> {
    return new Promise((res) => {
      const eventNameWrapper = _DOM_Store.bottomPanel.querySelector(
        ".bottomtable-eventname"
      ) as HTMLSpanElement;

      if (eventNameWrapper.textContent) {
        res();
        return;
      }

      const observer = new MutationObserver(() => {
        const eventSpan = eventNameWrapper.querySelector("span")!;
        if (!eventSpan.textContent) {
          return;
        }
        observer.disconnect();

        res();
      });
      observer.observe(eventNameWrapper, {
        characterData: true,
        subtree: true,
        childList: true,
      });
    });
  }
}
