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
  pairPerRow: "",
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

loadUserSettings().catch(logError);
async function loadUserSettings() {
  Promise.all([
    ExtensionHelper.localStorage.getState("elo"),
    ExtensionHelper.localStorage.getState("ptnml"),
    ExtensionHelper.localStorage.getState("allowKeyboardShortcuts"),
    ExtensionHelper.localStorage.getState("addLinksToGameSchedule"),
    ExtensionHelper.localStorage.getState("replaceClockSvg"),
  ]).then((resultsArray: Partial<UserSettings>[]) => {
    resultsArray.forEach((result) => {
      const key = Object.keys(result)[0] as BooleanKeys<UserSettings>;
      userSettings[key] = result[key] ?? _State.userSettingsDefault[key];

      switch (key) {
        case "replaceClockSvg":
          if (userSettings.replaceClockSvg) {
            fixClockSVG();
          }
          break;
        case "ptnml":
        case "elo":
        case "allowKeyboardShortcuts":
        case "pgnFetch":
        case "agreementHighlight":
        case "addLinksToGameSchedule":
        case "displayEngineNames":
        case "materialCount":
          break;
        default:
          exhaustiveCheck(key);
          break;
      }
    });
  });

  ExtensionHelper.localStorage.getState("pairPerRow").then((result) => {
    userSettings.pairPerRow =
      result.pairPerRow ?? _State.userSettingsDefault.pairPerRow;
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

    dom_helpers.CrossTable.crEngineNames();

    const modal = document.querySelector(".modal-vue-modal-content");
    const images = modal?.querySelectorAll("img");

    engineImages.length = 0;
    engineImages.push(...Array.from(images ?? []));

    activeCells.forEach(convertCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

// todo add description
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

  // header with result like this --> 205 - 195 [+10]
  const cellHeader: HTMLDivElement | null = cell.querySelector(
    ".crosstable-head-to-head"
  );

  if (!cellHeader) {
    observeEmptyCell(cell);
    return;
  }

  cellHeader.id = "ccc-cell-header";

  // result table for h2h vs one opponent
  const crossTableCell: HTMLDivElement = cell.querySelector(
    ".crosstable-result-wrapper"
  )!;

  addClassToCrossTable(crossTableCell);
  const scoresArray = stats_helpers.getScoresFromH2HCell(crossTableCell);

  const [ptnml, wdlArray, stats] = stats_helpers.calculateStats(scoresArray);

  // * create stats
  const ptnmlWrapper = dom_helpers.CrossTable.crPTNMLStat(ptnml);
  const wdlWrapper = dom_helpers.CrossTable.crWDLStat(wdlArray);

  const additionalInfoWrapper = dom_helpers.CrossTable.crAdditionalStatCaret(
    stats,
    index_1,
    index_2
  );
  cell.append(additionalInfoWrapper);

  // * adds/removes user chosen stats to the header
  handleCustomStatVisibility(cellHeader, wdlWrapper, ptnmlWrapper);

  const observer = new MutationObserver(() => {
    observer.disconnect();
    liveUpdate();
  });

  observer.observe(crossTableCell, {
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

// * -------------
// * ...
// shows/hides elo&ptnml stats
function handleCustomStatVisibility(
  cellHeader: HTMLDivElement,
  wdlWrapper: HTMLDivElement,
  ptnmlWrapper: HTMLDivElement
) {
  const ptnmlElement = cellHeader.querySelector(".ccc-ptnml");
  const eloElement = cellHeader.querySelector(".ccc-wdl-container");
  const statWrappers = cellHeader.querySelectorAll(".ccc-stat-wrapper");

  if (userSettings.elo && !eloElement) {
    cellHeader.append(wdlWrapper);
  } else if (!userSettings.elo && eloElement) {
    statWrappers.forEach((wrapper) => {
      if (wrapper.contains(eloElement)) {
        cellHeader.removeChild(wrapper);
      }
    });
  }

  if (userSettings.ptnml && !ptnmlElement) {
    cellHeader.append(ptnmlWrapper);
  } else if (!userSettings.ptnml && ptnmlElement) {
    statWrappers.forEach((wrapper) => {
      if (wrapper.contains(ptnmlElement)) {
        cellHeader.removeChild(wrapper);
      }
    });
  }
}

// todo move to helper?
// handles creation of switch inputs for custom crosstable stats
function createOptionInputs() {
  const crossTableModal: HTMLDivElement | null = document.querySelector(
    ".modal-vue-modal-content"
  );

  if (!crossTableModal) return;
  const { width } = crossTableModal.getBoundingClientRect();
  if (width < 220) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-options-wrapper");

  const formElement = dom_helpers.CrossTable.crPairsPerRowForm();

  // * create switches
  const eloLabel = createSwitchLabel("WDL + Elo", "elo");
  const ptnmlLabel = createSwitchLabel("Ptnml", "ptnml");

  const extensionSettingsBtn = dom_helpers.CrossTable.crExtensionBtn();

  wrapper.append(formElement, eloLabel, ptnmlLabel, extensionSettingsBtn);

  handleLabelListeners(eloLabel);
  handleLabelListeners(ptnmlLabel);

  crossTableModal.append(wrapper);
}

function createSwitchLabel(text: string, field: BooleanKeys<UserSettings>) {
  const label = document.createElement("label");
  const switchInput = document.createElement("input");

  label.classList.add("ccc-label");
  label.textContent = `${text}:`;
  label.setAttribute("data-name", field);

  label.htmlFor = `id-${field}`;
  switchInput.id = label.htmlFor;

  switchInput.classList.add("ccc-input");
  switchInput.type = "checkbox";

  switchInput.checked = userSettings[field] ?? true;

  label.append(switchInput);

  return label;
}

function addClassToCrossTable(crossTableCell: HTMLDivElement) {
  crossTableCell.classList.add("ccc-cell-grid");
  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }
}

function applyStylesToGrid() {
  const is1v1 = enginesAmount === 2;

  const rows = is1v1 ? userSettings.pairsPerRowDuel : userSettings.pairPerRow;

  document.body.style.setProperty(
    "--custom-column-amount",
    `${rows ? rows * 2 : ""}`
  );
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
  const crossTableModal = document.querySelector(".modal-vue-modal-content");
  const tournamentsList = document.querySelector(".bottomtable-resultspopup");
  const engineDetailsPanel = document.querySelector(".enginedetails-panel");
  const settingsModal = document.querySelector(".modal-container-component");
  // todo
  // not yet implemented
  // custom elements
  const statsModal = document.querySelector(".ccc-info-backdrop");
  const extensionSettings = document.querySelector(".ccc-options-backdrop");

  if (statsModal) {
    const infoBtn = statsModal.parentNode;
    infoBtn?.removeChild(statsModal);
    return;
  }
  if (extensionSettings) {
    document.body.removeChild(extensionSettings);
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
  const { allowKeyboardShortcuts: allow } = userSettings;
  ExtensionHelper.localStorage.setState("allowKeyboardShortcuts", allow);

  userSettings.allowKeyboardShortcuts = allow;
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

  const links = Array.from(container.querySelectorAll(".schedule-gameLink"));
  const gameInProgress = container.querySelector(".schedule-inProgress");

  // do not include current game
  if (gameInProgress) {
    links.pop();
  }

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

  convertCrossTable();

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
