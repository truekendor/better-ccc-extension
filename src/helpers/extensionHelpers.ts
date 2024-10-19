// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtensionHelper {
  // todo rewrite
  private static messageMethods = {
    sendMessage: (message: message_pass.message) => {
      try {
        // @ts-expect-error incompatible browser return types
        browserPrefix.runtime.sendMessage(message);
      } catch (e) {
        Utils.logError(e);
      }
      return false;
    },

    /** sends ready to BG script on document load */
    sendReady: () => {
      const message: message_pass.message = {
        type: "onload",
        payload: {
          doRequest: !ExtractPageData.isMobile,
        },
      };

      try {
        // @ts-expect-error some cross browser error idc
        browserPrefix.runtime.sendMessage(message);
      } catch (e) {
        Utils.logError(e);
      }

      return false;
    },

    /**
     * todo
     */
    requestReverseGame: async () => {
      const gameNumber = await ExtractPageData.getCurrentGameNumber();
      const eventId = _State.eventId;

      if (!eventId) {
        // todo retry logic?
        console.log("ExtensionHelper::requestReverseGame: eventId is null");
        return;
      }
      if (ExtractPageData.isMobile) {
        return;
      }

      new ExtensionMessage({
        type: "reverse_pgn_request",
        payload: {
          event: eventId,
          gameNumber,
        },
      }).sendToBg();
    },

    /**
     * todo
     */
    requestReverseFor: async (gameNumber: number) => {
      const eventId = _State.eventId;

      if (!eventId) {
        // todo retry logic?
        console.log("ExtensionHelper::requestReverseFor: eventId is null");
        return;
      }
      // currently too buggy on android
      if (ExtractPageData.isMobile) {
        return;
      }

      new ExtensionMessage({
        type: "reverse_pgn_request",
        payload: {
          event: eventId,
          gameNumber,
        },
      }).sendToBg();
    },
  } as const;

  // * =====================
  // * getters

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  static get localStorage() {
    const localStorageMethods = {
      getState: function <T extends keyof user_config.settings>(keys: T | T[]) {
        return browserPrefix?.storage?.local
          .get(keys)
          .catch(Utils.logError) as Promise<
          Prettify<Pick<user_config.settings, T>>
        >;
      },

      setState: function <T extends Partial<user_config.settings>>(obj: T) {
        return browserPrefix?.storage?.local.set(obj).catch(Utils.logError);
      },

      getUserState: function () {
        return browserPrefix.storage.local
          .get(Object.keys(UserSettings.customSettings))
          .catch(Utils.logError) as Promise<Prettify<user_config.settings>>;
      },
    } as const;

    return localStorageMethods;
  }

  static get messages(): typeof this.messageMethods {
    return this.messageMethods;
  }

  /**
   * todo add description
   */
  public static applyUserSettings<K extends BooleanKeys<user_config.settings>>(
    key: K
  ): void {
    switch (key) {
      case "replaceClockSvg":
        if (UserSettings.customSettings.replaceClockSvg) {
          fixClockSVG();
        }
        break;
      case "allowKeyboardShortcuts":
        toggleAllowKeyboardShortcuts();
        break;
      case "showCapturedPieces":
        this.handleShowCapturedPieces();
        break;
      case "highlightReverseDeviation":
        if (!UserSettings.customSettings.highlightReverseDeviation) {
          HighlightDeviation.clearHighlight();
        }
        break;
      case "displayEngineNames":
        this.engineNamesLiveUpdateHandler();

        break;
      // todo
      case "addLinksToGameSchedule":
      case "allowNetworkGameRequest":
      case "elo":
      case "ptnml":
        break;
      case "clearQueryStringOnCurrentGame":
        this.handleClearURLHash();
        break;
      default:
        // exhaustive check
        console.log(key satisfies never);
        break;
    }
  }

  /**
   * todo add description
   */
  public static _dev_applyUserSettings<
    K extends keyof Pick<
      user_config.settings,
      "bookMovesColor" | "deviationColor"
    >
  >(key: K): void {
    switch (key) {
      case "bookMovesColor":
        this.changeDeviationClr(UserSettings.customSettings.deviationColor);
        break;
      case "deviationColor":
        this.changeBookMoveClr(UserSettings.customSettings.bookMovesColor);
        break;

      default:
        // exhaustive check
        console.log(key satisfies never);
        break;
    }
  }

  public static async changeBookMoveClr(HEXvalue: string) {
    await this.localStorage.setState({
      bookMovesColor: HEXvalue,
    });

    if (HEXvalue === "") {
      document.body.style.setProperty("--ccc-book-move-clr", "");
      document.body.style.setProperty("--ccc-book-move-clr-hover", "");

      return;
    }

    const lightnessShiftPercent = 18;

    const rgbArr = Color.hexToRGBArray(HEXvalue);
    const [h, s, l] = Color.RGBToHSLArray(...rgbArr);
    const hoverLightness =
      l + lightnessShiftPercent > 100
        ? l - lightnessShiftPercent
        : l + lightnessShiftPercent;

    document.body.style.setProperty(
      "--ccc-book-move-clr",
      `hsl(${h},${s}%,${l}%)`
    );
    document.body.style.setProperty(
      "--ccc-book-move-clr-hover",
      `hsl(${h},${s}%,${hoverLightness}%)`
    );

    const oldValue = document.body.getAttribute("data-custom-styles") || "";
    if (!oldValue.includes("movetable-clr")) {
      document.body.setAttribute(
        "data-custom-styles",
        oldValue + " movetable-clr"
      );
    }
  }

  public static async changeDeviationClr(HEXvalue: string) {
    await this.localStorage.setState({
      deviationColor: HEXvalue,
    });

    if (HEXvalue === "") {
      document.body.style.setProperty("--ccc-deviation-move-clr", "");
      return;
    }

    const rgbArr = Color.hexToRGBArray(HEXvalue);
    const [h, s, l] = Color.RGBToHSLArray(...rgbArr);

    document.body.style.setProperty(
      "--ccc-deviation-move-clr",
      `hsl(${h},${s}%,${l}%)`
    );

    const oldValue = document.body.getAttribute("data-custom-styles") || "";
    if (!oldValue.includes("deviation-clr")) {
      document.body.setAttribute(
        "data-custom-styles",
        oldValue + " deviation-clr"
      );
    }
  }

  private static handleShowCapturedPieces(): void {
    const capturedPiecesWrappers: NodeListOf<HTMLDivElement> =
      document.querySelectorAll(".ccc-captured-pieces-wrapper");

    capturedPiecesWrappers.forEach((wrapper) => {
      const action = !UserSettings.customSettings.showCapturedPieces
        ? "add"
        : "remove";

      wrapper.classList[action]("ccc-hide");
    });
  }

  /**
   * removes event id from hash query string
   * if clicked on ongoing game
   */
  private static handleClearURLHash(): void {
    document.addEventListener("click", (e) => {
      if (
        !e.target ||
        !UserSettings.customSettings.clearQueryStringOnCurrentGame
      ) {
        return;
      }

      // @ts-expect-error idk why there is no classList on event target
      if (e.target?.classList?.contains("schedule-in-progress")) {
        new ExtensionMessage({
          type: "remove_query",
          payload: null,
        }).sendToBg();
      }
    });
  }

  private static engineNamesLiveUpdateHandler() {
    if (UserSettings.customSettings.displayEngineNames) {
      components.CrossTable.crEngineNames();
      return;
    }

    const crosstableModal = document.querySelector(
      "#crosstable-crosstableModal"
    );
    if (!crosstableModal) {
      return;
    }

    const row = crosstableModal.querySelector("table > tr");
    if (!row) {
      return;
    }

    const cells = row.querySelectorAll("th");

    cells.forEach((cell, index) => {
      if (index < 2) {
        return;
      }

      cell.textContent = `${index - 1}`;
    });
  }
}

class ExtensionMessage {
  private message: message_pass.message;

  constructor(message: message_pass.message) {
    this.message = message;
  }

  sendToBg() {
    try {
      // @ts-expect-error "incompatible" browser return types
      browserPrefix.runtime.sendMessage(this.message) as Promise<unknown>;
    } catch (e) {
      Utils.logError(e);
    }
  }
}
