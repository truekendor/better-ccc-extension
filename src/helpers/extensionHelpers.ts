// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtensionHelper {
  // todo rewrite with static class instance
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
        payload: null,
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

  // todo add return type
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
        if (UserSettings.custom.replaceClockSvg) {
          fixClockSVG();
        }
        break;
      case "allowKeyboardShortcuts":
        toggleAllowKeyboardShortcuts();
        break;
      case "materialCount":
        this.handleMaterialCountCase();
        break;
      case "highlightReverseDeviation":
        if (!UserSettings.custom.highlightReverseDeviation) {
          HighlightReverseDeviation.clearMoveTableClasses();
        }
        break;
      // todo
      case "addLinksToGameSchedule":
      case "displayEngineNames":
      case "allowNetworkGameRequest":
      case "elo":
      case "ptnml":
      case "drawnPairNeutralColorWL":
        break;
      case "clearQueryStringOnCurrentGame":
        this.handlerClearQuery();
        break;
      default:
        console.log(key satisfies never);
        break;
    }
  }

  private static handleMaterialCountCase(): void {
    const capturedPiecesWrappers: NodeListOf<HTMLDivElement> =
      document.querySelectorAll(".ccc-captured-pieces-wrapper");

    capturedPiecesWrappers.forEach((wrapper) => {
      const action = !UserSettings.custom.materialCount ? "add" : "remove";

      wrapper.classList[action]("ccc-hide");
    });
  }

  /**
   * removes event id from hash query string
   * if clicked on ongoing game
   */
  private static handlerClearQuery(): void {
    document.addEventListener("click", (e) => {
      if (!e.target || !UserSettings.custom.clearQueryStringOnCurrentGame) {
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
}

// todo add description
class ExtensionMessage {
  private message: message_pass.message;

  constructor(message: message_pass.message) {
    this.message = message;
  }

  sendToBg(): boolean {
    try {
      // @ts-ignore
      browserPrefix.runtime.sendMessage(this.message) as Promise<unknown>;
      return false;
    } catch (e) {
      Utils.logError(e);
      return false;
    }
  }
}