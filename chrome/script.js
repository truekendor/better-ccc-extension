"use strict";
/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />
/// <reference path="./types/lila-tb.ts" />
/** cells with H2H results */
let crossTableElements;
// todo move to state?
let enginesAmount = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatter = Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const browserPrefix = chrome?.storage ? chrome : browser;
loadUserSettings().catch(Utils.logError);
async function loadUserSettings() {
    await ExtensionHelper.localStorage
        .getState([
        "elo",
        "ptnml",
        "allowKeyboardShortcuts",
        "addLinksToGameSchedule",
        "replaceClockSvg",
        "displayEngineNames",
        "showCapturedPieces",
        "clearQueryStringOnCurrentGame",
        "highlightReverseDeviation",
    ])
        .then((state) => {
        const keys = Utils.objectKeys(state);
        // get user settings from extension local storage
        keys.forEach((key) => {
            UserSettings.customSettings[key] =
                state[key] ?? UserSettings.defaultSettings[key];
        });
    })
        .then(async () => {
        // init absent settings in store with default values
        const result = await ExtensionHelper.localStorage.getUserState();
        const allKeys = Utils.objectKeys(result);
        allKeys.forEach((key) => {
            if (result[key] !== null && result[key] !== undefined) {
                return;
            }
            ExtensionHelper.localStorage.setState({
                [key]: UserSettings.defaultSettings[key],
            });
        });
    })
        .catch(Utils.logError);
    const keys = Utils.objectKeys(UserSettings.customSettings);
    keys.forEach((key) => {
        if (key === "pairsPerRow" ||
            key === "pairsPerRowDuel" ||
            key === "crosstablePairStyle") {
            return;
        }
        ExtensionHelper.applyUserSettings(key);
    });
    if (UserSettings.customSettings.highlightReverseDeviation) {
        ExtensionHelper.messages.sendReady();
    }
    ExtensionHelper.localStorage
        .getState(["crosstablePairStyle"])
        .then((result) => {
        UserSettings.customSettings.crosstablePairStyle =
            result.crosstablePairStyle;
    });
    // todo move to that one Promise.all
    ExtensionHelper.localStorage
        .getState(["pairsPerRow", "pairsPerRowDuel"])
        .then((result) => {
        UserSettings.customSettings.pairsPerRow =
            result.pairsPerRow ?? UserSettings.defaultSettings.pairsPerRow;
        UserSettings.customSettings.pairsPerRowDuel =
            result.pairsPerRowDuel ?? UserSettings.defaultSettings.pairsPerRowDuel;
    });
}
// todo move to some state/storage
const engineImages = [];
// * observers
observeModalOpen();
// * ---------------
// * extension logic
function convertCrossTable() {
    try {
        enginesAmount = document.querySelectorAll(".crosstable-empty").length || 0;
        applyStylesToGrid();
        const optionsWrapper = document.querySelector(".ccc-options-wrapper");
        if (!optionsWrapper) {
            createOptionInputs();
        }
        const activeCells = Array.from(crossTableElements).filter((el) => {
            if (el.classList.contains("crosstable-empty"))
                return;
            return el;
        });
        if (activeCells.length === 0) {
            // if we're here, then cross table
            // was opened before game data was received
            // and this function will handle live update
            observeInitial();
        }
        if (UserSettings.customSettings.displayEngineNames) {
            components.CrossTable.crEngineNames();
        }
        const modal = document.querySelector(".modal-vue-modal-content");
        const images = modal?.querySelectorAll("img");
        engineImages.length = 0;
        engineImages.push(...Array.from(images ?? []));
        activeCells.forEach(convertCell);
    }
    catch (e) {
        Utils.logError(e);
    }
}
function getImageIndexes(cell) {
    let index_1 = -1;
    let index_2 = -1;
    const parent = cell.parentNode;
    const grandParent = cell?.parentNode?.parentNode;
    if (parent && grandParent) {
        for (let i = 0; i < parent?.childNodes?.length ?? 0; i++) {
            const current = parent?.childNodes[i];
            if (current !== cell)
                continue;
            index_1 = i;
            break;
        }
        for (let i = 0; i < grandParent?.childNodes?.length ?? 0; i++) {
            const current = grandParent?.childNodes[i];
            // @ts-ignore
            if (current !== cell?.parentNode)
                continue;
            index_2 = i;
            break;
        }
    }
    index_1 -= 6;
    index_2 -= 2;
    return [index_1, index_2];
}
function convertCell(cell) {
    const [index_1, index_2] = getImageIndexes(cell);
    // header with a score string like this: 205 - 195 [+10]
    const cellHeader = cell.querySelector(".crosstable-head-to-head");
    if (!cellHeader) {
        observeEmptyCell(cell);
        return;
    }
    cellHeader.id = "ccc-cell-header";
    // result table for h2h vs one opponent
    const resultWrapper = cell.querySelector(".crosstable-result-wrapper");
    addClassToCrossTableCell(resultWrapper);
    const gameResultElementList = resultWrapper.querySelectorAll(".crosstable-result");
    const pairsPerRow = getPairsPerRowAmount() ||
        parseInt(getComputedStyle(resultWrapper, null).getPropertyValue("--column-amount")) / 2;
    const scoresArray = CrosstableHelper.getScoresFromList(gameResultElementList);
    CrosstableHelper.paintGamePairs(gameResultElementList, scoresArray, pairsPerRow || 1);
    const [ptnml, wdlArray, stats] = CrosstableHelper.calculateStats(scoresArray);
    // eslint-disable-next-line no-constant-condition
    if (enginesAmount <= 8 && false) {
        const caretSvg = cell.querySelector(".ccc-info-button");
        if (!caretSvg) {
            const additionalInfoWrapper = components.CrossTable.crAdditionalStatButton(stats, index_1, index_2);
            cell.append(additionalInfoWrapper);
        }
    }
    // * adds/removes ptnml & elo+wdl stats
    const ptnmlElement = cellHeader.querySelector(".ccc-ptnml-wrapper");
    const eloWdlElement = cellHeader.querySelector(".ccc-wdl-wrapper");
    const ptnmlAction = !UserSettings.customSettings["ptnml"] ? "add" : "remove";
    const eloAction = !UserSettings.customSettings["elo"] ? "add" : "remove";
    if (!ptnmlElement) {
        const ptnmlWrapper = components.CrossTable.crPTNMLStat(ptnml);
        cellHeader.append(ptnmlWrapper);
        ptnmlWrapper.classList[ptnmlAction]("ccc-display-none");
    }
    else {
        ptnmlElement.classList[ptnmlAction]("ccc-display-none");
    }
    if (!eloWdlElement) {
        const eloWdlWrapper = components.CrossTable.crWDLStat(wdlArray);
        cellHeader.append(eloWdlWrapper);
        eloWdlWrapper.classList[eloAction]("ccc-display-none");
    }
    else {
        eloWdlElement.classList[eloAction]("ccc-display-none");
    }
    if (cell.hasAttribute("data-observed")) {
        return;
    }
    cell.setAttribute("data-observed", "true");
    const observer = new MutationObserver(() => {
        observer.disconnect();
        const header = cell.querySelector("#ccc-cell-header");
        if (!header)
            return;
        const wrappers = cell.querySelectorAll(".ccc-stat-wrapper");
        wrappers?.forEach((wrapper) => {
            header?.removeChild(wrapper);
        });
        convertCell(cell);
        observer.observe(resultWrapper, {
            childList: true,
        });
    });
    observer.observe(resultWrapper, {
        childList: true,
    });
}
// observes prematurely opened cross table
function observeInitial() {
    try {
        const initObserver = new MutationObserver(() => {
            initObserver.disconnect();
            openCrossTableHandler();
        });
        const modal = document.querySelector(".modal-vue-modal-container");
        if (!modal)
            return;
        initObserver.observe(modal, {
            childList: true,
            subtree: true,
        });
    }
    catch (e) {
        Utils.logError(e);
    }
}
// observes cells with no h2h records
function observeEmptyCell(cell) {
    const observer = new MutationObserver(() => {
        observer.disconnect();
        convertCell(cell);
    });
    observer.observe(cell, {
        childList: true,
    });
}
function observeModalOpen() {
    const observer = new MutationObserver(() => {
        ShareModal.just_do_it();
        if (!document.querySelector(".modal-vue-modal"))
            return;
        queueMicrotask(openCrossTableHandler);
    });
    observer.observe(_DOM_Store.mainContainer, {
        childList: true,
    });
}
// handles creation of switch inputs for custom crosstable stats
function createOptionInputs() {
    const crossTableModal = document.querySelector(".modal-vue-modal-content");
    if (!crossTableModal)
        return;
    const { width } = crossTableModal.getBoundingClientRect();
    if (width < 220)
        return;
    const wrapper = document.createElement("div");
    const closeBtn = crossTableModal.querySelector(".modal-close");
    wrapper.classList.add("ccc-options-wrapper");
    const pairsPerRowForm = components.CrossTable.crPairsPerRowForm();
    // * create switches
    const eloLabel = components.CrossTable.crSettingsSwitch("WDL + Elo", "elo");
    const ptnmlLabel = components.CrossTable.crSettingsSwitch("Ptnml", "ptnml");
    const extensionSettingsBtn = components.ExtensionSettings.crExtensionSettingsBtn();
    wrapper.append(pairsPerRowForm, eloLabel, ptnmlLabel, extensionSettingsBtn);
    handleLabelListeners(eloLabel);
    handleLabelListeners(ptnmlLabel);
    crossTableModal.insertBefore(wrapper, closeBtn);
}
function addClassToCrossTableCell(crossTableCell) {
    crossTableCell.classList.add("ccc-cell-grid");
    if (enginesAmount === 2) {
        crossTableCell.classList.add("one-v-one");
    }
    else if (enginesAmount > 8) {
        crossTableCell.classList.add("many");
    }
}
function applyStylesToGrid() {
    const rows = getPairsPerRowAmount();
    document.body.style.setProperty("--custom-column-amount", `${rows ? rows * 2 : ""}`);
}
function getPairsPerRowAmount() {
    const is1v1 = enginesAmount === 2;
    const rows = is1v1
        ? UserSettings.customSettings.pairsPerRowDuel
        : UserSettings.customSettings.pairsPerRow;
    return rows;
}
// * ----------------------------
// * event handlers && event listeners
window.addEventListener("keydown", keydownHandler);
const validKeyCodes = ["Escape", "KeyG", "KeyC", "KeyS", "KeyU"];
function keydownHandler(e) {
    // @ts-ignore
    if (!validKeyCodes.includes(e.code))
        return;
    // enable/disable keyboard shortcuts
    if (e.code === "KeyU" && e.shiftKey && e.ctrlKey) {
        UserSettings.customSettings.allowKeyboardShortcuts =
            !UserSettings.customSettings.allowKeyboardShortcuts;
        toggleAllowKeyboardShortcuts();
        return;
    }
    if (!UserSettings.customSettings.allowKeyboardShortcuts)
        return;
    // open crosstable
    if (e.code === "KeyC" && !e.ctrlKey) {
        if (e.target !== document.body || !_DOM_Store.standingsBtn)
            return;
        e.stopPropagation();
        _DOM_Store.standingsBtn.click();
        const container = document.getElementById("standings-standings");
        if (container) {
            openCrossTableWithKeyboard(container);
        }
        else {
            openCrossTableFromOtherTab();
        }
        return;
    }
    // open schedule
    if (e.code === "KeyS" && !e.ctrlKey) {
        if (e.target !== document.body)
            return;
        e.stopPropagation();
        if (!_DOM_Store.scheduleBtn)
            return;
        queueMicrotask(() => {
            _DOM_Store.scheduleBtn?.click();
        });
        return;
    }
    if (e.code === "Escape") {
        closeModalsOnKeydownHandler();
        return;
    }
}
function openCrossTableWithKeyboard(container) {
    const crossTableBtn = container?.querySelector("button");
    if (!crossTableBtn)
        return;
    crossTableBtn.click();
}
function openCrossTableFromOtherTab() {
    const divWithBtn = document.querySelectorAll(".selection-panel-container + div")[2];
    const loader = document.querySelector(".cpu-champs-page-loader-wrapper");
    if (!divWithBtn)
        return;
    const observer = new MutationObserver(() => {
        observer.disconnect();
        const container = document.getElementById("standings-standings");
        if (!container)
            return;
        openCrossTableWithKeyboard(container);
        if (loader) {
            _DOM_Store.scheduleBtn.click();
        }
    });
    observer.observe(divWithBtn, {
        childList: true,
    });
}
function closeModalsOnKeydownHandler() {
    // * ccc modals and popups
    const crossTableModal = document.querySelector(".modal-vue-modal-content");
    const tournamentsList = document.querySelector(".bottomtable-resultspopup");
    const engineDetailsPanel = document.querySelector(".enginedetails-panel");
    const settingsModal = document.querySelector(".modal-container-component");
    // * custom elements
    const moreStatsModal = document.querySelector(".ccc-info-backdrop");
    const extensionSettingsModal = document.querySelector(".ccc-settings-backdrop");
    if (moreStatsModal) {
        const infoBtn = moreStatsModal.parentNode;
        infoBtn?.removeChild(moreStatsModal);
        return;
    }
    if (extensionSettingsModal && crossTableModal) {
        const modalContent = extensionSettingsModal.firstElementChild;
        modalContent.focus();
        extensionSettingsModal.click();
        return;
    }
    if (crossTableModal) {
        const closeBtn = crossTableModal.querySelector(".modal-close");
        closeBtn?.click();
        return;
    }
    if (tournamentsList) {
        const closeDiv = document.querySelector(".bottomtable-event-name-wrapper");
        closeDiv?.click();
        return;
    }
    if (engineDetailsPanel) {
        const closeBtn = document.querySelector("#enginedetails-close");
        closeBtn?.click();
        return;
    }
    if (settingsModal) {
        const closeBtn = settingsModal.querySelector(".settings-modal-container-close");
        closeBtn?.click();
        return;
    }
}
function openCrossTableHandler() {
    try {
        const crossTableModal = document.querySelector(".modal-vue-modal-content");
        if (!crossTableModal)
            return;
        crossTableModal.setAttribute("data-style", UserSettings.customSettings.crosstablePairStyle);
        crossTableElements = crossTableModal.querySelectorAll(".crosstable-results-cell");
        convertCrossTable();
    }
    catch (e) {
        Utils.logError(e);
    }
}
function handleSwitchEvent(field) {
    UserSettings.customSettings[field] = !UserSettings.customSettings[field];
    convertCrossTable();
    ExtensionHelper.localStorage.setState({
        [field]: UserSettings.customSettings[field],
    });
}
function toggleAllowKeyboardShortcuts() {
    const { allowKeyboardShortcuts } = UserSettings.customSettings;
    ExtensionHelper.localStorage.setState({ allowKeyboardShortcuts });
    UserSettings.customSettings.allowKeyboardShortcuts = allowKeyboardShortcuts;
}
observeScheduleClick();
function observeScheduleClick() {
    // container with schedule entries
    const container = _DOM_Store.bottomPanel.querySelector(".selection-panel-container + div");
    const observer = new MutationObserver(() => {
        createScheduleLinks();
    });
    observer.observe(container, {
        childList: true,
    });
}
function createScheduleLinks() {
    const container = _DOM_Store.bottomPanel.querySelector(".schedule-container");
    if (!UserSettings.customSettings.addLinksToGameSchedule || !container)
        return;
    const links = Array.from(container.children);
    const baseURL = "https://www.chess.com/computer-chess-championship#";
    const eventName = _State.eventId;
    if (!eventName) {
        return;
    }
    links.forEach((link, index) => {
        const src = `${baseURL}event=${eventName}&game=${index + 1}`;
        const anchor = document.createElement("a");
        anchor.classList.add("ccc-game-link");
        anchor.href = src;
        link.append(anchor);
    });
}
function handleLabelListeners(label) {
    const attr = label.getAttribute("data-name");
    label.addEventListener("change", () => {
        handleSwitchEvent(attr);
    });
    label.addEventListener("keydown", (e) => {
        if (e.code !== "Enter")
            return;
        label.querySelector("input").checked = !UserSettings.customSettings[attr];
        handleSwitchEvent(attr);
    });
}
_DOM_Store.scheduleBtn.addEventListener("click", () => {
    const scheduleContainer = _DOM_Store.bottomPanel.querySelector(".schedule-container");
    if (!scheduleContainer)
        return;
    scrollToCurrentGame();
});
function scrollToCurrentGame() {
    const currentGame = _DOM_Store.bottomPanel.querySelector(".schedule-in-progress") ??
        _DOM_Store.bottomPanel.querySelector(".ccc-current-game");
    const container = _DOM_Store.bottomPanel.querySelector(".schedule-container");
    const lastGame = container?.lastElementChild || null;
    if (currentGame) {
        currentGame.scrollIntoView();
    }
    else if (lastGame) {
        lastGame.scrollIntoView();
    }
}
