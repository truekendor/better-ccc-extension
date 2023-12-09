/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />
/// <reference path="./types/lila-tb.ts" />

let crossTableBtn: HTMLButtonElement | null;
/** cells with H2H results */
let crossTableElements: NodeListOf<HTMLTableCellElement>;

let crossTableModal: HTMLDivElement | null;
let crossTableWithScroll: HTMLDivElement | null;

let enginesAmount = 0;

const formatter = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const userSettings: UserSettings = {
  ptnml: true,
  elo: true,
  pairsPerRow: "",
  pairsPerRowDuel: "",
  allowKeyboardShortcuts: true,
  agreementHighlight: true,
  pgnFetch: true,
  addLinksToGameSchedule: true,
  replaceClockSvg: true,
  displayEngineNames: true,
  materialCount: true,
};

const browserPrefix: Browsers = chrome?.storage ? chrome : browser;

loadUserSettings().catch(utils.logError);
async function loadUserSettings() {
  await ExtensionHelper.localStorage
    .getState([
      "elo",
      "ptnml",
      "allowKeyboardShortcuts",
      "addLinksToGameSchedule",
      "replaceClockSvg",
      "displayEngineNames",
      "materialCount",
    ])
    .then((res) => {
      const keys = utils.objectKeys(res);
      keys.forEach((key) => {
        userSettings[key] = res[key] ?? _State.userSettingsDefault[key];
      });
    });

  if (userSettings.replaceClockSvg) {
    fixClockSVG();
  }

  ExtensionHelper.localStorage.getState("pairsPerRow").then((result) => {
    userSettings.pairsPerRow =
      result.pairsPerRow ?? _State.userSettingsDefault.pairsPerRow;
  });

  ExtensionHelper.localStorage.getState("pairsPerRowDuel").then((result) => {
    userSettings.pairsPerRowDuel =
      result.pairsPerRowDuel ?? _State.userSettingsDefault.pairsPerRowDuel;
  });
}

const engineImages: HTMLImageElement[] = [];

// * observers
observeOpenCrossTable();

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
      if (el.classList.contains("crosstable-empty")) return;

      return el;
    });

    if (activeCells.length === 0) {
      // if we're here, then cross table
      // was opened before game data was received
      // and this function will handle live update
      observeInitial();
    }

    if (userSettings.displayEngineNames) {
      dom_elements.CrossTable.crEngineNames();
    }

    const modal = document.querySelector(".modal-vue-modal-content");
    const images = modal?.querySelectorAll("img");

    engineImages.length = 0;
    engineImages.push(...Array.from(images ?? []));

    activeCells.forEach(convertCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

function getImageIndexes(cell: HTMLTableCellElement) {
  let index_1: number = -1;
  let index_2: number = -1;

  const parent = cell.parentNode;
  const grandParent = cell?.parentNode?.parentNode;

  if (parent && grandParent) {
    for (let i = 0; i < parent?.childNodes?.length ?? 0; i++) {
      const current = parent?.childNodes[i];
      if (current !== cell) continue;
      index_1 = i;
      break;
    }

    for (let i = 0; i < grandParent?.childNodes?.length ?? 0; i++) {
      const current = grandParent?.childNodes[i];
      // @ts-ignore
      if (current !== cell?.parentNode) continue;
      index_2 = i;
      break;
    }
  }

  index_1 -= 6;
  index_2 -= 2;

  return [index_1, index_2] as const;
}

function convertCell(cell: HTMLTableCellElement) {
  const [index_1, index_2] = getImageIndexes(cell);

  // header with a score string like this: 205 - 195 [+10]
  const cellHeader: HTMLDivElement | null = cell.querySelector(
    ".crosstable-head-to-head"
  );

  if (!cellHeader) {
    observeEmptyCell(cell);
    return;
  }

  cellHeader.id = "ccc-cell-header";

  // result table for h2h vs one opponent
  const resultWrapper: HTMLDivElement = cell.querySelector(
    ".crosstable-result-wrapper"
  )!;

  addClassToCrossTableCell(resultWrapper);

  const gameResultElementList: NodeListOf<HTMLDivElement> =
    resultWrapper.querySelectorAll(".crosstable-result");

  const pairsPerRow =
    getPairsPerRowAmount() ||
    parseInt(
      getComputedStyle(resultWrapper, null).getPropertyValue("--column-amount")
    ) / 2;

  const scoresArray = stats_helpers.getScoresFromList(gameResultElementList);
  stats_helpers.paintGamePairs(
    gameResultElementList,
    scoresArray,
    pairsPerRow || 1
  );

  const [ptnml, wdlArray, stats] = stats_helpers.calculateStats(scoresArray);

  if (enginesAmount <= 8) {
    const caretSvg = cell.querySelector(".ccc-info-button");

    if (!caretSvg) {
      const additionalInfoWrapper =
        dom_elements.CrossTable.crAdditionalStatCaret(stats, index_1, index_2);
      cell.append(additionalInfoWrapper);
    }
  }

  // * adds/removes ptnml & elo+wdl stats
  const ptnmlElement = cellHeader.querySelector(".ccc-ptnml-wrapper");
  const eloWdlElement = cellHeader.querySelector(".ccc-wdl-wrapper");

  const ptnmlAction = !userSettings["ptnml"] ? "add" : "remove";
  const eloAction = !userSettings["elo"] ? "add" : "remove";

  if (!ptnmlElement) {
    const ptnmlWrapper = dom_elements.CrossTable.crPTNMLStat(ptnml);
    cellHeader.append(ptnmlWrapper);
    ptnmlWrapper.classList[ptnmlAction]("ccc-display-none");
  } else {
    ptnmlElement.classList[ptnmlAction]("ccc-display-none");
  }

  if (!eloWdlElement) {
    const eloWdlWrapper = dom_elements.CrossTable.crWDLStat(wdlArray);

    cellHeader.append(eloWdlWrapper);
    eloWdlWrapper.classList[eloAction]("ccc-display-none");
  } else {
    eloWdlElement.classList[eloAction]("ccc-display-none");
  }

  if (cell.hasAttribute("data-observed")) {
    return;
  }

  cell.setAttribute("data-observed", "true");

  const observer = new MutationObserver(() => {
    observer.disconnect();
    const header = cell.querySelector("#ccc-cell-header");
    if (!header) return;

    const wrappers = cell.querySelectorAll(".ccc-stat-wrapper");

    wrappers?.forEach((wrapper: Element) => {
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

    if (!modal) return;
    initObserver.observe(modal, {
      childList: true,
      subtree: true,
    });
  } catch (e: any) {
    console.log(e.message);
  }
}

// observes cells with no h2h records
function observeEmptyCell(cell: HTMLTableCellElement) {
  const observer = new MutationObserver(() => {
    observer.disconnect();
    convertCell(cell);
  });

  observer.observe(cell, {
    childList: true,
  });
}

function observeOpenCrossTable() {
  const observer = new MutationObserver(() => {
    shareModalCb();

    const modal = document.querySelector(".modal-vue-modal");
    if (!modal) return;

    queueMicrotask(openCrossTableHandler);
  });

  observer.observe(_DOM_Store.mainContainer, {
    childList: true,
  });
}

// live cross table update
function liveUpdate() {
  try {
    const activeCells = Array.from(crossTableElements).filter((el) => {
      if (el.classList.contains("crosstable-empty")) {
        enginesAmount++;
        return;
      }
      return el;
    });
    if (activeCells.length === 0) return;

    // for each cell with games in it
    // find and remove all custom elements
    activeCells.forEach((cell) => {
      const header = cell.querySelector("#ccc-cell-header");
      if (!header) return;

      // wrappers for custom stats
      const wrappers = cell.querySelectorAll(".ccc-stat-wrapper");

      wrappers?.forEach((wrapper: Element) => {
        header?.removeChild(wrapper);
      });
    });

    convertCrossTable();
  } catch (e: any) {
    console.log(e.message ?? e);
  }
}

// handles creation of switch inputs for custom crosstable stats
function createOptionInputs() {
  const crossTableModal: HTMLDivElement | null = document.querySelector(
    ".modal-vue-modal-content"
  );

  if (!crossTableModal) return;
  const { width } = crossTableModal.getBoundingClientRect();
  if (width < 220) return;

  const wrapper = document.createElement("div");
  const closeBtn = crossTableModal.querySelector(".modal-close")!;

  wrapper.classList.add("ccc-options-wrapper");

  const pairsPerRowForm = dom_elements.CrossTable.crPairsPerRowForm();

  // * create switches
  const eloLabel = dom_elements.CrossTable.crSettingsSwitch("WDL + Elo", "elo");
  const ptnmlLabel = dom_elements.CrossTable.crSettingsSwitch("Ptnml", "ptnml");

  const extensionSettingsBtn = dom_elements.CrossTable.crExtensionSettingsBtn();

  wrapper.append(pairsPerRowForm, eloLabel, ptnmlLabel, extensionSettingsBtn);

  handleLabelListeners(eloLabel);
  handleLabelListeners(ptnmlLabel);

  crossTableModal.insertBefore(wrapper, closeBtn);
}

function addClassToCrossTableCell(crossTableCell: HTMLDivElement) {
  crossTableCell.classList.add("ccc-cell-grid");
  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }
}

function applyStylesToGrid() {
  const rows = getPairsPerRowAmount();

  document.body.style.setProperty(
    "--custom-column-amount",
    `${rows ? rows * 2 : ""}`
  );
}

function getPairsPerRowAmount() {
  const is1v1 = enginesAmount === 2;
  const rows = is1v1 ? userSettings.pairsPerRowDuel : userSettings.pairsPerRow;

  return rows;
}

// * ----------------------------
// * event handlers && event listeners

window.addEventListener("keydown", keydownHandler);

const validKeyCodes = ["Escape", "KeyG", "KeyC", "KeyS", "KeyU"] as const;
function keydownHandler(e: KeyboardEvent) {
  // @ts-ignore
  if (!validKeyCodes.includes(e.code)) return;

  // enable/disable keyboard shortcuts
  if (e.code === "KeyU" && e.shiftKey && e.ctrlKey) {
    userSettings.allowKeyboardShortcuts = !userSettings.allowKeyboardShortcuts;
    toggleAllowKeyboardShortcuts();

    return;
  }
  if (!userSettings.allowKeyboardShortcuts) return;

  // open crosstable
  if (e.code === "KeyC" && !e.ctrlKey) {
    if (e.target !== document.body || !_DOM_Store.standingsBtn) return;
    e.stopPropagation();

    _DOM_Store.standingsBtn.click();

    const container = document.getElementById("standings-standings");

    if (container) {
      openCrossTableWithKeyboard(container);
    } else {
      openCrossTableFromOtherTab();
    }

    return;
  }

  // open schedule
  if (e.code === "KeyS" && !e.ctrlKey) {
    if (e.target !== document.body) return;
    e.stopPropagation();

    if (!_DOM_Store.scheduleBtn) return;

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

function openCrossTableWithKeyboard(container: HTMLElement) {
  crossTableBtn = container?.querySelector("button");
  if (!crossTableBtn) return;

  crossTableBtn.click();
}

function openCrossTableFromOtherTab() {
  const divWithBtn = document.querySelectorAll(
    ".selection-panel-container + div"
  )[2];

  const loader = document.querySelector(".cpu-champs-page-loader-wrapper");

  if (!divWithBtn) return;

  const observer = new MutationObserver(() => {
    observer.disconnect();
    const container = document.getElementById("standings-standings");
    if (!container) return;

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
  const moreStatsModal: HTMLDivElement | null =
    document.querySelector(".ccc-info-backdrop");
  const extensionSettingsModal: HTMLDivElement | null = document.querySelector(
    ".ccc-options-backdrop"
  );

  if (moreStatsModal) {
    const infoBtn = moreStatsModal.parentNode;
    infoBtn?.removeChild(moreStatsModal);
    return;
  }
  if (extensionSettingsModal && crossTableModal) {
    const modalContent =
      extensionSettingsModal.firstElementChild! as HTMLDivElement;

    modalContent.focus();
    extensionSettingsModal.click();

    return;
  }
  if (crossTableModal) {
    const closeBtn: HTMLButtonElement | null =
      crossTableModal.querySelector(".modal-close");
    closeBtn?.click();
    return;
  }
  if (tournamentsList) {
    const closeDiv: HTMLDivElement | null = document.querySelector(
      ".bottomtable-event-name-wrapper"
    );
    closeDiv?.click();
    return;
  }
  if (engineDetailsPanel) {
    const closeBtn: HTMLIFrameElement | null = document.querySelector(
      "#enginedetails-close"
    );

    closeBtn?.click();
    return;
  }
  if (settingsModal) {
    const closeBtn: HTMLButtonElement | null = settingsModal.querySelector(
      ".settings-modal-container-close"
    );

    closeBtn?.click();
    return;
  }
}

function openCrossTableHandler() {
  try {
    const crossTableModal: HTMLDivElement | null = document.querySelector(
      ".modal-vue-modal-content"
    );

    if (!crossTableModal) return;

    crossTableElements = crossTableModal.querySelectorAll(
      ".crosstable-results-cell"
    );

    convertCrossTable();
  } catch (e: any) {
    console.log(e.message ?? e);
  }
}

// ! --------------------
// ! --------------------
// ! dev ----------------

function handleSwitchEvent(field: BooleanKeys<UserSettings>) {
  userSettings[field] = !userSettings[field];

  ExtensionHelper.localStorage
    .setState(field, userSettings[field])
    .then(convertCrossTable);
}

function toggleAllowKeyboardShortcuts() {
  const { allowKeyboardShortcuts } = userSettings;
  ExtensionHelper.localStorage.setState(
    "allowKeyboardShortcuts",
    allowKeyboardShortcuts
  );

  userSettings.allowKeyboardShortcuts = allowKeyboardShortcuts;
}

observeScheduleClick();
function observeScheduleClick() {
  // container with schedule entries
  const container = _DOM_Store.bottomPanel.querySelector(
    ".selection-panel-container + div"
  )!;

  const observer = new MutationObserver(() => {
    createGameScheduleLinks();
  });

  observer.observe(container, {
    childList: true,
  });
}

function createGameScheduleLinks() {
  const container: HTMLDivElement | null = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  if (!userSettings.addLinksToGameSchedule || !container) return;

  const links = Array.from(container.children);

  const baseURL = "https://www.chess.com/computer-chess-championship#";
  const eventName = _State.tabData.event || _State.eventHrefList[0];

  if (!eventName) return;

  links.forEach((link, index) => {
    const src = `${baseURL}event=${eventName}&game=${index + 1}`;

    const anchor = document.createElement("a");

    anchor.classList.add("ccc-game-link");
    anchor.href = src;

    link.append(anchor);
  });
}

function eloPtnmlTriggerHandler(
  optionToToggle: Extract<BooleanKeys<UserSettings>, "elo" | "ptnml">
) {
  const crossTableModal = document.querySelector(".modal-vue-modal-content");
  if (!crossTableModal) return;

  const labels: HTMLLabelElement[] = Array.from(
    crossTableModal.querySelectorAll(`.ccc-label`)
  );

  labels.forEach((label) => {
    const attr = label.getAttribute("data-name") as BooleanKeys<UserSettings>;
    if (optionToToggle !== attr) return;

    userSettings[optionToToggle] = !userSettings[optionToToggle];
    label.click();
  });
}

function handleLabelListeners(label: HTMLLabelElement) {
  const attr = label.getAttribute("data-name") as BooleanKeys<UserSettings>;

  label.addEventListener("change", () => {
    handleSwitchEvent(attr);
  });

  label.addEventListener("keydown", (e) => {
    if (e.code !== "Enter") return;

    label.querySelector("input")!.checked = !userSettings[attr];
    handleSwitchEvent(attr);
  });
}

function shareModalCb() {
  updateShareModalFENInput()._bind(addListenersToShareFENInput);
  addDownloadGameLogsBtn();

  // click-outside-to-close for settings modal
  const settingsModal: HTMLDivElement | null =
    _DOM_Store.mainContainer.querySelector(".modal-container-component");

  if (!settingsModal) return;
  const modalContent = settingsModal.querySelector("section")!;

  modalContent.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  settingsModal.addEventListener(
    "click",
    function (e) {
      e.stopPropagation();

      const closeBtn = settingsModal.querySelector("button")!;
      closeBtn.click();
    },
    { once: true }
  );
}
