"use strict";
var _a;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtensionHelper {
    // * =====================
    // * getters
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    static get localStorage() {
        const localStorageMethods = {
            getState: function (keys) {
                return browserPrefix?.storage?.local
                    .get(keys)
                    .catch(Utils.logError);
            },
            setState: function (obj) {
                return browserPrefix?.storage?.local.set(obj).catch(Utils.logError);
            },
            getUserState: function () {
                return browserPrefix.storage.local
                    .get(Object.keys(UserSettings.customSettings))
                    .catch(Utils.logError);
            },
        };
        return localStorageMethods;
    }
    static get messages() {
        return this.messageMethods;
    }
    /**
     * todo add description
     */
    static applyUserSettings(key) {
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
                console.log(key);
                break;
        }
    }
    static handleShowCapturedPieces() {
        const capturedPiecesWrappers = document.querySelectorAll(".ccc-captured-pieces-wrapper");
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
    static handleClearURLHash() {
        document.addEventListener("click", (e) => {
            if (!e.target ||
                !UserSettings.customSettings.clearQueryStringOnCurrentGame) {
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
    static engineNamesLiveUpdateHandler() {
        if (UserSettings.customSettings.displayEngineNames) {
            components.CrossTable.crEngineNames();
            return;
        }
        const crosstableModal = document.querySelector("#crosstable-crosstableModal");
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
_a = ExtensionHelper;
// todo rewrite
ExtensionHelper.messageMethods = {
    sendMessage: (message) => {
        try {
            // @ts-expect-error incompatible browser return types
            browserPrefix.runtime.sendMessage(message);
        }
        catch (e) {
            Utils.logError(e);
        }
        return false;
    },
    /** sends ready to BG script on document load */
    sendReady: () => {
        const message = {
            type: "onload",
            payload: {
                doRequest: !ExtractPageData.isMobile,
            },
        };
        try {
            // @ts-expect-error some cross browser error idc
            browserPrefix.runtime.sendMessage(message);
        }
        catch (e) {
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
    requestReverseFor: async (gameNumber) => {
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
};
class ExtensionMessage {
    constructor(message) {
        this.message = message;
    }
    sendToBg() {
        try {
            // @ts-expect-error "incompatible" browser return types
            browserPrefix.runtime.sendMessage(this.message);
        }
        catch (e) {
            Utils.logError(e);
        }
    }
}
