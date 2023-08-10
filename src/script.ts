const standingsDiv = document.getElementById("bottomtable-bottomtable")!;

const content = document.getElementById("righttable-content");
const chat = document.querySelector("chat-chat");

// panel with vote/standings/schedule buttons
const btnPanel = standingsDiv.querySelector(".selection-panel-container")!;
// button with text "Standings"
const standingsBtn = btnPanel.querySelectorAll("span")[1];

let crossTableBtn: HTMLButtonElement | null;
let crossTableElements: NodeListOf<HTMLTableCellElement>;

let crossTableModal: HTMLDivElement | null;
let crossTableWithScroll: HTMLDivElement | null;

standingsBtn.addEventListener("click", standingsBtnClickHandler);

// need this for @media queries
let enginesAmount = 0;

const formatter = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const userCustomOptions: Options = {
  ptnml: true,
  elo: true,
  pairPerRow: undefined,
  drawBgOnEmptyCells: false,
  allowHotkeys: true,
};

const userCustomOptionsDefault: Options = {
  ptnml: true,
  elo: true,
  pairPerRow: undefined,
  drawBgOnEmptyCells: false,
  allowHotkeys: true,
} as const;

const browserPrefix: Browsers = chrome?.storage ? chrome : browser;

function loadUserSettings(): void {
  try {
    browserPrefix.storage.local
      .get("elo" as keyof Options)
      .then(({ elo }: Partial<Options>) => {
        userCustomOptions.elo = elo ?? userCustomOptionsDefault.elo;
      });

    browserPrefix.storage.local
      .get("ptnml" as keyof Options)
      .then((result: Partial<Options>) => {
        userCustomOptions.ptnml =
          result.ptnml ?? userCustomOptionsDefault.ptnml;
      });

    browserPrefix.storage.local
      .get("pairPerRow" as keyof Options)
      .then((result: Partial<Options>) => {
        userCustomOptions.pairPerRow =
          result.pairPerRow ?? userCustomOptionsDefault.pairPerRow;
        applyStylesToGrid();
      });

    browserPrefix.storage.local
      .get("drawBgOnEmptyCells" as keyof Options)
      .then((result: Partial<Options>) => {
        userCustomOptions.drawBgOnEmptyCells =
          result.drawBgOnEmptyCells ??
          userCustomOptionsDefault.drawBgOnEmptyCells;

        applyStylesToEmptyCells();
      });

    browserPrefix.storage.local
      .get("allowHotkeys" as keyof Options)
      .then((result: Partial<Options>) => {
        userCustomOptions.allowHotkeys =
          result.allowHotkeys ?? userCustomOptionsDefault.allowHotkeys;
      });
  } catch (e: any) {
    console.log(e.message);
  }
}

loadUserSettings();

let spaceKeyPressed = false;

// * typescript
enum Pairs {
  DoubleWin = "ccc-double-win",
  Win = "ccc-win",
  Draw = "ccc-draw",
  Loss = "ccc-loss",
  DoubleLoss = "ccc-double-loss",
}

type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];
type PTNML = [number, number, number, number, number];
type LabelForField = keyof Omit<Options, "pairPerRow">;

type TChrome = typeof chrome;
type TFirefox = typeof browser;
type Browsers = TChrome | TFirefox;

interface Options {
  ptnml: boolean;
  elo: boolean;
  pairPerRow: number | undefined;
  drawBgOnEmptyCells: boolean;
  allowHotkeys: boolean;
}

interface AdditionalStats {
  longestLossless: number;
  longestWinStreak: number;
  longestWinless: number;
  pairsRatio: number;
  performancePercent: number;
}

// * ---------------
// * extension logic
function convertCrossTable(): void {
  try {
    enginesAmount = 0;
    const optionsWrapper = document.querySelector(".ccc-options-wrapper");
    if (!optionsWrapper) {
      createOptionInputs();
    }

    // @ts-ignore
    const activeCells = [...crossTableElements].filter((el) => {
      if (el.classList.contains("crosstable-empty")) {
        enginesAmount++;
        return;
      }
      return el;
    });

    if (activeCells.length === 0) {
      // if we're here, then cross table
      // was opened before game data was received
      // and this function will handle live update for cross table
      observeInitial();
    }

    const engines = document.querySelectorAll(".crosstable-name");
    if (engines && enginesAmount >= 6) {
      const enginesNames: string[] = [];
      engines.forEach((engine) => {
        enginesNames.push(engine.textContent!.replace("\n", "").trim());
      });

      // since we're in convert crosstable() crossTable is not null
      const crossTable = document.querySelector(".crosstable-crosstable")!;
      const standingsRow = crossTable.querySelector("tr")!;
      const enginesRows = standingsRow.querySelectorAll(
        ".font-extra-faded-white"
      );

      enginesRows.forEach((row, index) => {
        row.textContent = `${index + 1} ${enginesNames[index]}`;
      });
    }

    activeCells.forEach(convertCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

// observes prematurely opened cross table
function observeInitial(): void {
  try {
    const initObserver = new MutationObserver(() => {
      initObserver.disconnect();
      crossTableBtnClickHandler();
    });

    const modal = document.querySelector(".modal-vue-modal-container");

    if (modal) {
      initObserver.observe(modal, {
        childList: true,
        subtree: true,
      });
    }
  } catch (e: any) {
    console.log(e.message);
  }
}

// observes cells with no h2h records
function observeEmpty(cell: HTMLTableCellElement): void {
  try {
    const observer = new MutationObserver(() => {
      observer.disconnect();

      convertCell(cell);
    });

    observer.observe(cell, {
      childList: true,
    });
  } catch (e: any) {
    console.log(e.message);
  }
}

function convertCell(cell: HTMLTableCellElement): void {
  try {
    // header with result -->       205 - 195 [+10]
    const cellHeader: HTMLDivElement | null = cell.querySelector(
      ".crosstable-head-to-head"
    );

    if (!cellHeader) {
      observeEmpty(cell);
      return;
    }

    cellHeader.id = "ccc-cell-header";

    // result table for h2h vs one opponent
    const crossTableCell: HTMLDivElement = cell.querySelector(
      ".crosstable-result-wrapper"
    )!;

    addClassNamesCrossTable(crossTableCell);
    const scoresArray = calculateScores(crossTableCell);

    const [ptnml, wdlArray, stats] = getStats(scoresArray);

    // * create stats
    const ptnmlWrapper = createPTNMLStatHeader(ptnml);
    const wdlWrapper = createWDLStatHeader(wdlArray);

    // const additionalInfoWrapper = createAdvancedStats(stats);
    // cell.append(additionalInfoWrapper);

    // * adds/removes user chosen stats to the header
    handleCustomStat(cellHeader, wdlWrapper, ptnmlWrapper);

    const observer = new MutationObserver(() => {
      observer.disconnect();

      liveUpdate();
    });

    observer.observe(crossTableCell, {
      childList: true,
    });
  } catch (e: any) {
    console.log(e.message);
  }
}

// updates stats with each new game result
function liveUpdate(): void {
  try {
    // @ts-ignore
    const activeCells = [...crossTableElements].filter((el) => {
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

      wrappers?.forEach((wrapper) => {
        header?.removeChild(wrapper);
      });
    });

    convertCrossTable();
  } catch (e: any) {
    console.log(e.message);
  }
}

// * -------------
// * utils
// @ts-ignore
function getStats(arr: ResultAsScore[]): [PTNML, WDL, AdditionalStats] {
  try {
    const wdlArray: WDL = [0, 0, 0]; // W D L in that order
    arr.forEach((score) => {
      // score is either 1 0 -1
      // so by doing this we automatically
      // increment correct value
      wdlArray[1 - score] += 1;
    });

    // to get rid of an unfinished pair
    if (arr.length % 2 === 1) arr.pop();
    const ptnml: PTNML = [0, 0, 0, 0, 0]; // ptnml(0-2)

    const stats: AdditionalStats = {
      longestLossless: 0,
      longestWinStreak: 0,
      pairsRatio: 0,
      performancePercent: 0,
      longestWinless: 0,
    };

    // lossless
    let longesLosslessRecord = 0;
    let longesLosslessCurrent = 0;

    // win streak
    let longestWinRecord = 0;
    let longestWinCurrent = 0;

    // winless
    let longestWinlessRecord = 0;
    let longestWinlessCurrent = 0;

    for (let i = 0; i < arr.length; i += 2) {
      const first = arr[i];
      const second = arr[i + 1];
      const res = first + second;

      if (res === 2) {
        ptnml[4] += 1;

        longesLosslessCurrent += 1;
        longestWinCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinlessCurrent = 0;
      } else if (res === 1) {
        ptnml[3] += 1;

        longesLosslessCurrent += 1;
        longestWinCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinlessCurrent = 0;
      } else if (res === 0) {
        ptnml[2] += 1;
        longesLosslessCurrent += 1;
        longestWinlessCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinCurrent = 0;
      } else if (res === -1) {
        ptnml[1] += 1;
        longestWinlessCurrent += 1;

        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinCurrent = 0;
        longesLosslessCurrent = 0;
      } else {
        ptnml[0] += 1;
        longestWinlessCurrent += 1;

        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinCurrent = 0;
        longesLosslessCurrent = 0;
      }
    }

    stats.longestLossless = longesLosslessRecord;
    stats.longestWinStreak = longestWinRecord;
    stats.longestWinless = longestWinlessRecord;
    stats.performancePercent =
      ((wdlArray[0] + wdlArray[1] / 2) /
        (wdlArray[0] + wdlArray[1] + wdlArray[2])) *
      100;

    stats.pairsRatio = (ptnml[4] + ptnml[3]) / Math.max(ptnml[1] + ptnml[0], 0);

    return [ptnml, wdlArray, stats];
  } catch (e: any) {
    console.log(e.message);
  }
}

function getResultFromNode(node: HTMLDivElement): ResultAsScore {
  if (node.classList.contains("win")) return 1;
  if (node.classList.contains("draw")) return 0;
  return -1;
}

function getClassNameForPair(
  lastResult: ResultAsScore,
  currentResult: ResultAsScore
): Pairs {
  const pairScore = lastResult + currentResult;

  if (pairScore === 2) return Pairs.DoubleWin;
  if (pairScore === 1) return Pairs.Win;
  if (pairScore === 0) return Pairs.Draw;
  if (pairScore === -1) return Pairs.Loss;
  return Pairs.DoubleLoss;
}

function createStatWrapperElement(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-stat-wrapper");

  return wrapper;
}

function createWLDEloElement(
  wdl: WDL
): [HTMLDivElement, HTMLDivElement | undefined] {
  const numberOfGames = wdl.reduce((amount, prev) => amount + prev, 0);

  const wdlElement = document.createElement("div");
  wdlElement.classList.add("ccc-wdl-container");

  const w = document.createElement("p");
  const d = document.createElement("p");
  const l = document.createElement("p");

  w.textContent = `+${wdl[0]}`;
  d.textContent = `=${wdl[1]}`;
  l.textContent = `-${wdl[2]} `;

  // default CCC styles
  w.classList.add("win");
  d.classList.add("draw");
  // custom style for more contrast
  l.classList.add("ccc-loss-font");
  l.classList.add("ccc-margin-right");

  const points = wdl[0] + wdl[1] / 2;

  const percent = formatter.format((points / numberOfGames) * 100);

  let elo;
  let margin;
  let eloWrapper;

  if (numberOfGames >= 2) {
    elo = calculateEloFromPercent(parseFloat(percent));
    margin = calculateErrorMargin(wdl[0], wdl[1], wdl[2]);
    eloWrapper = createEloAndMarginElement(elo, margin);
  }

  wdlElement.append(w, d, l);

  return [wdlElement, eloWrapper];
}

function createEloAndMarginElement(
  elo: string,
  margin: string
): HTMLDivElement {
  const wrapper = document.createElement("div");
  const eloElement = document.createElement("p");
  const marginElement = document.createElement("p");

  wrapper.classList.add("ccc-elo-wrapper");

  eloElement.classList.add("ccc-elo");
  eloElement.classList.add(
    parseInt(elo) >= 0 ? "ccc-elo-positive" : "ccc-elo-negative"
  );

  eloElement.textContent = `${elo}`;

  marginElement.textContent = `${margin}`;
  marginElement.classList.add("ccc-error-margin");

  wrapper.append(eloElement, marginElement);

  return wrapper;
}

// leaves user chosen stats
function handleCustomStat(
  cellHeader: HTMLDivElement,
  wdlWrapper: HTMLDivElement,
  ptnmlWrapper: HTMLDivElement
): void {
  const ptnmlElement = cellHeader.querySelector(".ccc-ptnml");
  const eloElement = cellHeader.querySelector(".ccc-wdl-container");
  const statWrappers = cellHeader.querySelectorAll(".ccc-stat-wrapper");

  if (userCustomOptions.elo && !eloElement) {
    cellHeader.append(wdlWrapper);
  } else if (!userCustomOptions.elo && eloElement) {
    statWrappers.forEach((wrapper) => {
      if (wrapper.contains(eloElement)) {
        cellHeader.removeChild(wrapper);
      }
    });
  }

  if (userCustomOptions.ptnml && !ptnmlElement) {
    cellHeader.append(ptnmlWrapper);
  } else if (!userCustomOptions.ptnml && ptnmlElement) {
    statWrappers.forEach((wrapper) => {
      if (wrapper.contains(ptnmlElement)) {
        cellHeader.removeChild(wrapper);
      }
    });
  }
}

// handles creation of switch inputs for custom stats
function createOptionInputs(): void {
  const crossTableModal: HTMLDivElement | null = document.querySelector(
    ".modal-vue-modal-content"
  );

  if (!crossTableModal) {
    return;
  }
  const { width } = crossTableModal.getBoundingClientRect();
  if (width < 220) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-options-wrapper");

  const formElement = createRowsForm();

  // * create switches
  const eloLabel = createSwitchLabel("WDL + Elo", "elo");
  const ptnmlLabel = createSwitchLabel("Ptnml", "ptnml");

  wrapper.append(formElement, eloLabel, ptnmlLabel);

  eloLabel.addEventListener("change", () => {
    userCustomOptions.elo = !userCustomOptions.elo;

    browserPrefix.storage.local
      .set({ elo: userCustomOptions.elo })
      .then(convertCrossTable);
  });

  ptnmlLabel.addEventListener("change", () => {
    userCustomOptions.ptnml = !userCustomOptions.ptnml;

    browserPrefix.storage.local
      .set({ ptnml: userCustomOptions.ptnml })
      .then(convertCrossTable);
  });

  crossTableModal.append(wrapper);
}

function createPTNMLStatHeader(ptnml: PTNML): HTMLDivElement {
  const ptnmlWrapper = createStatWrapperElement();
  ptnmlWrapper.classList.add("ccc-ptnml-wrapper");

  const ptnmlElement = document.createElement("div");
  const ptnmlHeader = document.createElement("div");

  ptnmlHeader.id = "ptnml-header";
  ptnmlHeader.textContent = "Ptnml(0-2)";

  ptnmlElement.textContent = `${ptnml[0]}, ${ptnml[1]}, ${ptnml[2]}, ${ptnml[3]}, ${ptnml[4]}`;
  ptnmlElement.classList.add("ccc-ptnml");

  ptnmlWrapper.append(ptnmlHeader, ptnmlElement);

  return ptnmlWrapper;
}

function createWDLStatHeader(wdlArray: WDL): HTMLDivElement {
  const wdlWrapper = createStatWrapperElement();
  wdlWrapper.classList.add("ccc-wdl-wrapper");

  const [wdlElement, eloElement] = createWLDEloElement(wdlArray);

  wdlWrapper.append(wdlElement);
  if (eloElement) {
    wdlWrapper.append(eloElement);
  }
  return wdlWrapper;
}

function createRowsForm(): HTMLFormElement {
  const formElement = document.createElement("form");
  const rowAmountInput = document.createElement("input");

  formElement.classList.add("ccc-form");
  rowAmountInput.classList.add("ccc-row-input");

  formElement.textContent = `Pairs per row`;

  rowAmountInput.type = "number";
  rowAmountInput.min = "0";
  rowAmountInput.value = `${userCustomOptions.pairPerRow}`;
  formElement.append(rowAmountInput);

  formElement.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = rowAmountInput.valueAsNumber;

    browserPrefix.storage.local.set({ pairPerRow: value || "" });

    userCustomOptions.pairPerRow = value;

    document.body.style.setProperty(
      "--custom-column-amount",
      `${value ? value * 2 : ""}`
    );
  });

  return formElement;
}

function createSwitchLabel(
  text: string,
  field: LabelForField
): HTMLLabelElement {
  const label = document.createElement("label");
  const switchInput = document.createElement("input");

  label.classList.add("ccc-label");
  label.textContent = `${text}:`;

  switchInput.classList.add("ccc-input");
  switchInput.type = "checkbox";

  switchInput.checked = userCustomOptions[field] ?? true;

  label.append(switchInput);

  return label;
}

// ! not in release
function createAdvancedStats(stats: AdditionalStats) {
  const additionalStatsWrapper = document.createElement("div");

  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const iconPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );

  iconSvg.setAttribute("fill", "none");
  iconSvg.setAttribute("viewBox", "0 0 320 512");
  iconSvg.setAttribute("stroke", "none");
  iconSvg.setAttribute("height", "1em");

  iconPath.setAttribute(
    "d",
    "M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"
  );
  iconPath.setAttribute("stroke-linecap", "round");
  iconPath.setAttribute("stroke-linejoin", "round");
  iconPath.setAttribute("stroke-width", "2");

  iconSvg.appendChild(iconPath);
  additionalStatsWrapper.append(iconSvg);

  additionalStatsWrapper.classList.add("ccc-info-button");

  additionalStatsWrapper.addEventListener("click", (e) => {
    e.stopPropagation();

    const statsElementBackdrop = document.createElement("div");
    statsElementBackdrop.classList.add("ccc-info-backdrop");

    statsElementBackdrop.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.target !== statsElementBackdrop) return;
      additionalStatsWrapper.removeChild(statsElementBackdrop);
    });

    const infoElement = document.createElement("div");
    infoElement.classList.add("ccc-info-panel");

    infoElement.innerHTML = "";
    const p1 = document.createElement("p");
    p1.textContent = `Longest lossless streak: ${stats.longestLossless} pairs`;
    const p2 = document.createElement("p");
    p2.textContent = `Longest win streak: ${stats.longestWinStreak} pairs`;
    const p3 = document.createElement("p");
    p3.textContent = `Longest winless streak: ${stats.longestWinless} pairs`;
    const p4 = document.createElement("p");
    p4.textContent = `Pairs Ratio: ${formatter.format(stats.pairsRatio)}`;
    const p5 = document.createElement("p");
    p5.textContent = `Performance: ${formatter.format(
      stats.performancePercent
    )}%`;

    infoElement.append(p1, p2, p3, p5);
    statsElementBackdrop.append(infoElement);
    additionalStatsWrapper.append(statsElementBackdrop);
  });

  return additionalStatsWrapper;
}

function addClassNamesCrossTable(crossTableCell: HTMLDivElement): void {
  crossTableCell.classList.add("ccc-cell-grid");
  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }
}

function calculateScores(crossTableCell: HTMLDivElement): ResultAsScore[] {
  const gameResultsDivs: NodeListOf<HTMLDivElement> =
    crossTableCell.querySelectorAll(".crosstable-result");

  const scoresArray: ResultAsScore[] = [];
  let lastResult: ResultAsScore;

  gameResultsDivs.forEach((result, index) => {
    // ID needed to overwrite default CCC styles
    if (result) {
      result.id = "ccc-result";
    }

    if (index % 2 === 0) {
      result.classList.add("ccc-border-left");

      lastResult = getResultFromNode(result);
      scoresArray.push(lastResult);
    } else {
      result.classList.add("ccc-border-right");

      const currentResult = getResultFromNode(result);
      const pairResult = getClassNameForPair(lastResult, currentResult);
      scoresArray.push(currentResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);
    }
  });

  return scoresArray;
}

function applyStylesToEmptyCells() {
  document.body.style.setProperty(
    "--ccc-pattern-bg-3",
    userCustomOptions.drawBgOnEmptyCells ? "transparent" : ""
  );
}

function applyStylesToGrid() {
  document.body.style.setProperty(
    "--custom-column-amount",
    `${userCustomOptions.pairPerRow ? userCustomOptions.pairPerRow * 2 : ""}`
  );
}

// * ----------------------------
// * event handlers and listeners

window.addEventListener("keydown", keydownHandler);

function keydownHandler(e: KeyboardEvent): void {
  if (
    e.code !== "Escape" &&
    e.code !== "KeyG" &&
    e.code !== "KeyC" &&
    e.code !== "KeyS" &&
    e.code !== "KeyU"
  ) {
    return;
  }

  // enable/disable hotkeys
  if (e.code === "KeyU" && e.shiftKey && e.ctrlKey) {
    browserPrefix.storage.local
      .set({
        allowHotkeys: !userCustomOptions.allowHotkeys,
      })
      .then(() => {
        userCustomOptions.allowHotkeys = !userCustomOptions.allowHotkeys;
      });

    return;
  }

  // open crosstable
  if (userCustomOptions.allowHotkeys && e.code === "KeyC") {
    if (e.target !== document.body || !standingsBtn) return;
    e.stopPropagation();

    standingsBtn.click();

    const container = document.getElementById("standings-standings");

    if (container) {
      handleOpenCrossTableKeyboard(container);
    } else {
      openCrossTableFromOtherTab();
    }

    return;
  }

  // open schedule
  if (userCustomOptions.allowHotkeys && e.code === "KeyS") {
    if (e.target !== document.body) return;
    e.stopPropagation();

    const scheduleBtn = btnPanel.querySelectorAll("span")[2];
    if (!scheduleBtn) return;

    queueMicrotask(() => {
      scheduleBtn?.click();
    });

    return;
  }

  // will add later
  if (userCustomOptions.allowHotkeys && e.code === "KeyG" && e.shiftKey) {
    toggleBgOfEmptyCells();
    return;
  }

  if (e.code === "Escape") {
    handleCloseModalOnKeydown();
    return;
  }
}

function handleOpenCrossTableKeyboard(container: HTMLElement) {
  crossTableBtn = container?.querySelector("button");
  if (!crossTableBtn) return;

  crossTableBtn?.click();

  queueMicrotask(crossTableBtnClickHandler);
}

function openCrossTableFromOtherTab() {
  const divWithBtn = document.querySelectorAll(
    ".selection-panel-container + div"
  )[2];

  // divWithBtn.classList.add("tomato");

  if (!divWithBtn) return;

  const observer = new MutationObserver(() => {
    observer.disconnect();
    const container = document.getElementById("standings-standings");
    if (!container) return;

    handleOpenCrossTableKeyboard(container);
  });

  observer.observe(divWithBtn, {
    childList: true,
  });
}

function toggleBgOfEmptyCells() {
  const crossTable = document.getElementById("crosstable-crosstableModal");
  if (!crossTable) return;

  userCustomOptions.drawBgOnEmptyCells = !userCustomOptions.drawBgOnEmptyCells;

  browserPrefix.storage.local
    .set({
      drawBgOnEmptyCells: userCustomOptions.drawBgOnEmptyCells,
    })
    .then(applyStylesToEmptyCells);
}

function handleCloseModalOnKeydown(): void {
  const statsModal = document.querySelector(".ccc-info-backdrop");
  const crossTableModal = document.querySelector(".modal-vue-modal-content");
  const tournamentsList = document.querySelector(".bottomtable-resultspopup");
  const engineDetailsPanel = document.querySelector(".enginedetails-panel");

  if (statsModal) {
    const infoBtn = statsModal.parentNode;
    infoBtn?.removeChild(statsModal);
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
}

function standingsBtnClickHandler(): void {
  try {
    const container = document.getElementById("standings-standings")!;

    crossTableBtn = container?.querySelector("button");
    crossTableBtn?.addEventListener("click", crossTableBtnClickHandler);
  } catch (e: any) {
    console.log(e.message);
  }
}

function crossTableBtnClickHandler(): void {
  try {
    const crossTableModal = document.querySelector(".modal-vue-modal-content");

    if (!crossTableModal) return;
    crossTableElements = crossTableModal.querySelectorAll(
      ".crosstable-results-cell"
    );

    convertCrossTable();
  } catch (e: any) {
    console.log(e.message);
  }
}

// * elo calculation
// these formulas are taken from https://3dkingdoms.com/chess/elo.htm
// and I have no idea how they work
function calculateEloFromPercent(percent: number): string {
  var percentage = percent / 100;
  var eloDiff = (-400 * Math.log(1 / percentage - 1)) / Math.LN10;

  var Sign = "";
  if (eloDiff > 0) {
    Sign = "+";
  }

  const eloDiffAsString = formatter.format(eloDiff);

  return `${Sign}${eloDiffAsString}`;
}

function calculateEloDifference(percentage: number): number {
  return (-400 * Math.log(1 / percentage - 1)) / Math.LN10;
}

function CalculateInverseErrorFunction(x: number): number {
  var pi = Math.PI;
  var a = (8 * (pi - 3)) / (3 * pi * (4 - pi));
  var y = Math.log(1 - x * x);
  var z = 2 / (pi * a) + y / 2;

  var ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);

  if (x < 0) return -ret;

  return ret;
}

function phiInv(p: number): number {
  return Math.sqrt(2) * CalculateInverseErrorFunction(2 * p - 1);
}

function calculateErrorMargin(
  wins: number,
  draws: number,
  losses: number
): string {
  var total = wins + draws + losses;
  var winP = wins / total;
  var drawP = draws / total;
  var lossP = losses / total;
  var percentage = (wins + draws * 0.5) / total;
  var winsDev = winP * Math.pow(1 - percentage, 2);
  var drawsDev = drawP * Math.pow(0.5 - percentage, 2);
  var lossesDev = lossP * Math.pow(0 - percentage, 2);
  var stdDeviation =
    Math.sqrt(winsDev + drawsDev + lossesDev) / Math.sqrt(total);

  var confidenceP = 0.95;
  var minConfidenceP = (1 - confidenceP) / 2;
  var maxConfidenceP = 1 - minConfidenceP;
  var devMin = percentage + phiInv(minConfidenceP) * stdDeviation;
  var devMax = percentage + phiInv(maxConfidenceP) * stdDeviation;

  var difference =
    calculateEloDifference(devMax) - calculateEloDifference(devMin);

  const errorMargin = formatter.format(difference / 2);

  return `±${errorMargin}`;
}
