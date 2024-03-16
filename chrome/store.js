"use strict";
var _a;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class _DOM_Store {
}
_a = _DOM_Store;
/**
 * main container
 *
 * contains all DOM elements except
 * the Twitch chat and the left navigation bar
 */
_DOM_Store.mainContainer = 
// for some reason class becomes an ID if opened from mobile
document.querySelector(".cpu-champs-page-ccc") ??
    document.querySelector("#cpu-champs-page-ccc");
// * =========================
// * bottom right part of the screen:
// ? <bottomPanel>
// ?   <eventList button>
// ?   <tabButtonsContainer>
// ?      <tabButtons - vote | standings | schedule etc... >
// ?   </tabButtonsContainer>
// ?   <...>
// ?     <...>
// ?   </...>
// ? </bottomPanel>
/**
 * div container on bottom-right part of the screen
 */
_DOM_Store.bottomPanel = document.getElementById("bottomtable-bottomtable");
_DOM_Store.tabButtonsContainer = _a.bottomPanel.querySelector(".selection-panel-container");
/**
 * node list of `vote` / `standings` / `schedule` / `match` / `info` buttons
 */
_DOM_Store.tabButtons = _a.bottomPanel.querySelectorAll(".selection-panel-item");
/**
 *  button with text "standings"
 */
_DOM_Store.standingsBtn = _a.tabButtons[1];
/**
 * button with text "schedule"
 */
_DOM_Store.scheduleBtn = _a.tabButtons[2];
// not all tab buttons, actually
_DOM_Store.allTabButtons = {
    voteBtn: _a.tabButtons[0],
    standings: _a.tabButtons[1],
    schedule: _a.tabButtons[2],
    match: _a.tabButtons[3],
    info: _a.tabButtons[4],
};
/**
 * direct parent of a `movesTable`
 */
_DOM_Store.movesTableContainer = document.querySelector(".movetable-tablewrapper");
/**
 * main moves table
 */
_DOM_Store.movesTable = _a.movesTableContainer.querySelector("table");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class _State {
    static get eventId() {
        return this.eventIdTab || this.eventIdWebpage;
    }
}
_State.eventIdTab = null;
_State.eventIdWebpage = null;
_State.gameNumberTab = null;
_State.isEventActive = null;
_State.gamesInTotal = null;
/**
 * @todo add description
 * user settings state
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class UserSettings {
}
UserSettings.defaultSettings = {
    // crosstable stat rules
    ptnml: true,
    elo: true,
    // crosstable styles
    displayEngineNames: true,
    crosstablePairStyle: "ccc-default",
    pairsPerRow: 5,
    pairsPerRowDuel: 10,
    // deviation highlight rules
    allowNetworkGameRequest: true,
    highlightReverseDeviation: true,
    // other rules
    addLinksToGameSchedule: true,
    allowKeyboardShortcuts: true,
    replaceClockSvg: true,
    showCapturedPieces: true,
    clearQueryStringOnCurrentGame: true,
};
UserSettings.customSettings = {
    // crosstable stat rules
    ptnml: true,
    elo: true,
    // crosstable styles
    displayEngineNames: true,
    crosstablePairStyle: "ccc-default",
    pairsPerRow: 5,
    pairsPerRowDuel: 10,
    // deviation highlight rules
    allowNetworkGameRequest: true,
    highlightReverseDeviation: true,
    // other rules
    addLinksToGameSchedule: true,
    allowKeyboardShortcuts: true,
    replaceClockSvg: true,
    showCapturedPieces: true,
    clearQueryStringOnCurrentGame: true,
};
