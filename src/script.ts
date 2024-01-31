/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />
/// <reference path="./types/lila-tb.ts" />

/** cells with H2H results */
let crossTableElements: NodeListOf<HTMLTableCellElement>;

// todo move to state?
let enginesAmount = 0;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatter = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const browserPrefix: Browsers = chrome?.storage ? chrome : browser;

loadUserSettings().catch(Utils.logError);
async function loadUserSettings(): Promise<void> {
  await ExtensionHelper.localStorage
    .getState([
      "elo",
      "ptnml",
      "allowKeyboardShortcuts",
      "addLinksToGameSchedule",
      "replaceClockSvg",
      "displayEngineNames",
      "materialCount",
      "clearQueryStringOnCurrentGame",
      "highlightReverseDeviation",
    ])
    .then((state) => {
      const keys = Utils.objectKeys(state);

      keys.forEach((key) => {
        UserSettings.custom[key] = state[key] ?? UserSettings.default[key];
      });

      // init settings in store with default valuesc
      const allKeys = Utils.objectKeys(UserSettings.custom);
      allKeys.forEach((key) => {
        browserPrefix.storage.local.get(key).then((value) => {
          if (Utils.objectKeys(value).length !== 0) {
            return;
          }
          browserPrefix.storage.local.set({
            [key]: UserSettings.default[key],
          });
        });
      });
    })
    .catch(Utils.logError);

  const keys = Utils.objectKeys(UserSettings.custom);
  keys.forEach((key) => {
    if (key === "pairsPerRow" || key === "pairsPerRowDuel") {
      return;
    }
    ExtensionHelper.applyUserSettings(key);
  });

  if (UserSettings.custom.highlightReverseDeviation) {
    ExtensionHelper.messages.sendReady();
  }

  // todo move to that one Promise.all
  ExtensionHelper.localStorage
    .getState(["pairsPerRow", "pairsPerRowDuel"])
    .then((result) => {
      UserSettings.custom.pairsPerRow =
        result.pairsPerRow ?? UserSettings.default.pairsPerRow;

      UserSettings.custom.pairsPerRowDuel =
        result.pairsPerRowDuel ?? UserSettings.default.pairsPerRowDuel;
    });
}

// todo move to some state/storage
const engineImages: HTMLImageElement[] = [];

// * observers
observeModalOpen();

// * ---------------
// * extension logic
function convertCrossTable(): void {
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

    if (UserSettings.custom.displayEngineNames) {
      components.CrossTable.crEngineNames();
    }

    const modal = document.querySelector(".modal-vue-modal-content");
    const images = modal?.querySelectorAll("img");

    engineImages.length = 0;
    engineImages.push(...Array.from(images ?? []));

    activeCells.forEach(convertCell);
  } catch (e: unknown) {
    Utils.logError(e);
  }
}

function getImageIndexes(
  cell: HTMLTableCellElement
): readonly [number, number] {
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

function convertCell(cell: HTMLTableCellElement): void {
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

  const scoresArray = CrosstableHelper.getScoresFromList(gameResultElementList);
  CrosstableHelper.paintGamePairs(
    gameResultElementList,
    scoresArray,
    pairsPerRow || 1
  );
  const [ptnml, wdlArray, stats] = CrosstableHelper.calculateStats(scoresArray);

  // eslint-disable-next-line no-constant-condition
  if (enginesAmount <= 8 && false) {
    const caretSvg = cell.querySelector(".ccc-info-button");

    if (!caretSvg) {
      const additionalInfoWrapper =
        components.CrossTable.crAdditionalStatButton(stats, index_1, index_2);
      cell.append(additionalInfoWrapper);
    }
  }

  // * adds/removes ptnml & elo+wdl stats
  const ptnmlElement = cellHeader.querySelector(".ccc-ptnml-wrapper");
  const eloWdlElement = cellHeader.querySelector(".ccc-wdl-wrapper");

  const ptnmlAction = !UserSettings.custom["ptnml"] ? "add" : "remove";
  const eloAction = !UserSettings.custom["elo"] ? "add" : "remove";

  if (!ptnmlElement) {
    const ptnmlWrapper = components.CrossTable.crPTNMLStat(ptnml);
    cellHeader.append(ptnmlWrapper);
    ptnmlWrapper.classList[ptnmlAction]("ccc-display-none");
  } else {
    ptnmlElement.classList[ptnmlAction]("ccc-display-none");
  }

  if (!eloWdlElement) {
    const eloWdlWrapper = components.CrossTable.crWDLStat(wdlArray);

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
function observeInitial(): void {
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
  } catch (e: unknown) {
    Utils.logError(e);
  }
}

// observes cells with no h2h records
function observeEmptyCell(cell: HTMLTableCellElement): void {
  const observer = new MutationObserver(() => {
    observer.disconnect();
    convertCell(cell);
  });

  observer.observe(cell, {
    childList: true,
  });
}

function observeModalOpen(): void {
  const observer = new MutationObserver(() => {
    shareModalCb();

    if (!document.querySelector(".modal-vue-modal")) return;

    queueMicrotask(openCrossTableHandler);
  });

  observer.observe(_DOM_Store.mainContainer, {
    childList: true,
  });
}

// handles creation of switch inputs for custom crosstable stats
function createOptionInputs(): void {
  const crossTableModal: HTMLDivElement | null = document.querySelector(
    ".modal-vue-modal-content"
  );

  if (!crossTableModal) return;
  const { width } = crossTableModal.getBoundingClientRect();
  if (width < 220) return;

  const wrapper = document.createElement("div");
  const closeBtn = crossTableModal.querySelector(".modal-close")!;

  wrapper.classList.add("ccc-options-wrapper");

  const pairsPerRowForm = components.CrossTable.crPairsPerRowForm();

  // * create switches
  const eloLabel = components.CrossTable.crSettingsSwitch("WDL + Elo", "elo");
  const ptnmlLabel = components.CrossTable.crSettingsSwitch("Ptnml", "ptnml");

  const extensionSettingsBtn = components.CrossTable.crExtensionSettingsBtn();

  wrapper.append(pairsPerRowForm, eloLabel, ptnmlLabel, extensionSettingsBtn);

  handleLabelListeners(eloLabel);
  handleLabelListeners(ptnmlLabel);

  crossTableModal.insertBefore(wrapper, closeBtn);
}

function addClassToCrossTableCell(crossTableCell: HTMLDivElement): void {
  crossTableCell.classList.add("ccc-cell-grid");
  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }
}

function applyStylesToGrid(): void {
  const rows = getPairsPerRowAmount();

  document.body.style.setProperty(
    "--custom-column-amount",
    `${rows ? rows * 2 : ""}`
  );
}

function getPairsPerRowAmount(): number | "" {
  const is1v1 = enginesAmount === 2;
  const rows = is1v1
    ? UserSettings.custom.pairsPerRowDuel
    : UserSettings.custom.pairsPerRow;

  return rows;
}

// * ----------------------------
// * event handlers && event listeners

window.addEventListener("keydown", keydownHandler);

const validKeyCodes = ["Escape", "KeyG", "KeyC", "KeyS", "KeyU"] as const;
function keydownHandler(e: KeyboardEvent): void {
  // @ts-ignore
  if (!validKeyCodes.includes(e.code)) return;

  // enable/disable keyboard shortcuts
  if (e.code === "KeyU" && e.shiftKey && e.ctrlKey) {
    UserSettings.custom.allowKeyboardShortcuts =
      !UserSettings.custom.allowKeyboardShortcuts;
    toggleAllowKeyboardShortcuts();

    return;
  }
  if (!UserSettings.custom.allowKeyboardShortcuts) return;

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

function openCrossTableWithKeyboard(container: HTMLElement): void {
  const crossTableBtn = container?.querySelector("button");
  if (!crossTableBtn) return;

  crossTableBtn.click();
}

function openCrossTableFromOtherTab(): void {
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

function closeModalsOnKeydownHandler(): void {
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

function openCrossTableHandler(): void {
  try {
    const crossTableModal: HTMLDivElement | null = document.querySelector(
      ".modal-vue-modal-content"
    );

    if (!crossTableModal) return;

    crossTableElements = crossTableModal.querySelectorAll(
      ".crosstable-results-cell"
    );

    convertCrossTable();
  } catch (e: unknown) {
    Utils.logError(e);
  }
}

function handleSwitchEvent(field: BooleanKeys<user_config.settings>): void {
  UserSettings.custom[field] = !UserSettings.custom[field];

  convertCrossTable();

  ExtensionHelper.localStorage.setState({
    [field]: UserSettings.custom[field],
  });
}

function toggleAllowKeyboardShortcuts(): void {
  const { allowKeyboardShortcuts } = UserSettings.custom;
  ExtensionHelper.localStorage.setState({ allowKeyboardShortcuts });

  UserSettings.custom.allowKeyboardShortcuts = allowKeyboardShortcuts;
}

observeScheduleClick();
function observeScheduleClick(): void {
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

function createGameScheduleLinks(): void {
  const container: HTMLDivElement | null = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  if (!UserSettings.custom.addLinksToGameSchedule || !container) return;

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

function handleLabelListeners(label: HTMLLabelElement): void {
  const attr = label.getAttribute(
    "data-name"
  ) as BooleanKeys<user_config.settings>;

  label.addEventListener("change", () => {
    handleSwitchEvent(attr);
  });

  label.addEventListener("keydown", (e) => {
    if (e.code !== "Enter") return;

    label.querySelector("input")!.checked = !UserSettings.custom[attr];
    handleSwitchEvent(attr);
  });
}

function shareModalCb(): void {
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

_DOM_Store.scheduleBtn.addEventListener("click", () => {
  const scheduleContainer = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  )! as HTMLDivElement;

  if (!scheduleContainer) return;

  scrollToCurrentGame();
});

function scrollToCurrentGame(): void {
  const currentGame =
    _DOM_Store.bottomPanel.querySelector(".schedule-in-progress") ??
    _DOM_Store.bottomPanel.querySelector(".ccc-current-game");

  const container: HTMLDivElement | null = _DOM_Store.bottomPanel.querySelector(
    ".schedule-container"
  );

  const lastGame: Element | null = container?.lastElementChild || null;

  if (currentGame) {
    currentGame.scrollIntoView();
  } else if (lastGame) {
    lastGame.scrollIntoView();
  }
}

function updateShareModalFENInput(): Maybe {
  const shareModal = _DOM_Store.mainContainer.querySelector(
    ".ui_modal-component"
  );
  if (!shareModal) return new Maybe(null);

  return new Maybe(shareModal.querySelector(".share-menu-content"))
    ._bind((container) => {
      return container.querySelector(".share-menu-tab-pgn-section");
    })
    ._bind((container) => {
      return container.querySelector("input");
    })
    ._bind((input: HTMLInputElement) => {
      const currentMoveNumber = ExtractPageData.getMoveNumber();
      const fen = chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

      input.value = fen || input.value;

      return input;
    });
}

function addDownloadGameLogsBtn(): Maybe {
  return new Maybe(document.querySelector(".ui_modal-component"))
    ._bind((modal: HTMLDivElement) => {
      const btn = modal.querySelector(".ccc-download-logs-btn");
      if (btn) return null;

      return modal.querySelector(".share-menu-content");
    })
    ._bind((modalContent: HTMLDivElement) => {
      const menu = modalContent.children[0];

      return menu;
    })
    ._bind(async (container: HTMLDivElement) => {
      const btn = document.createElement("a");

      btn.classList.add("ccc-download-logs-btn");

      btn.textContent = "Download game logs";
      btn.target = "_blank";
      btn.rel = "noopener";

      btn.setAttribute("download", "");

      const archiveLink = container.getAttribute("event-url");
      if (!archiveLink) return container;

      const gameNumber = await ExtractPageData.getCurrentGameNumber();
      const eventId = +archiveLink
        .split("/")
        .filter((el) => {
          const includes = el.includes(".pgn");
          if (!includes) return;
          return el;
        })[0]
        // returns tournament-${tournament-id}.pgn
        .split(".")[0]
        .split("-")[1];

      const link = `https://cccfiles.chess.com/archive/cutechess.debug-${eventId}-${
        eventId + +gameNumber
      }.zip`;

      btn.href = link;

      container.append(btn);

      return container;
    });
}

function addListenersToShareFENInput(input: HTMLInputElement): Maybe {
  const listenerAdded = input.getAttribute("data-listener-added");

  if (!listenerAdded) {
    input.setAttribute("data-listener-added", "true");

    input.addEventListener("keydown", (e) => {
      if (!e.code.toLowerCase().startsWith("arrow")) return;

      e.stopPropagation();
    });
  }

  return new Maybe(null);
}

observeEndOfLoadMain();

function observeEndOfLoadMain(): void {
  const mainContentContainer =
    document.querySelector(".cpu-champs-page-main") ?? _DOM_Store.mainContainer;

  _DOM_Store.scheduleBtn.click();

  if (!mainContentContainer) {
    return;
  }

  const observer = new MutationObserver(() => {
    observer.disconnect();

    if (!document.getElementById("#cpu-champs-page-ccc")) {
      scrollToCurrentGame();
    }

    // mutation observer events are microtasks themselves.
    // this is needed (?) just in case
    queueMicrotask(() => {
      ExtractPageData.setEventIdToState();

      createGameScheduleLinks();
    });
  });

  observer.observe(mainContentContainer, {
    childList: true,
  });
}
