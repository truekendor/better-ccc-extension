/// <reference types="./" />
/// <reference path="./index.d.ts" />

type PairValues = ValuesOfObject<typeof PairsObj>;

const mainContainer: HTMLDivElement = document.querySelector(
  ".cpu-champs-page-ccc"
)!;

// div container with main tabs: vote / standings / schedule / match / info
// and schedule entries / cross table Button etc
let standingsDiv = document.getElementById("bottomtable-bottomtable")!;

// twitch chat container div
const twitchChat = document.querySelector("chat-chat");

// list of vote / standings / schedule / match / info buttons
const buttons: NodeListOf<HTMLSpanElement> = standingsDiv.querySelectorAll(
  ".selection-panel-item"
)!;

let scheduleBtn: HTMLSpanElement = buttons[2];

// panel with vote/standings/schedule buttons
let btnPanel = standingsDiv.querySelector(".selection-panel-container")!;
// button with text "Standings"
let standingsBtn = btnPanel.querySelectorAll("span")[1];

let crossTableBtn: HTMLButtonElement | null;
let crossTableElements: NodeListOf<HTMLTableCellElement>;

let crossTableModal: HTMLDivElement | null;
let crossTableWithScroll: HTMLDivElement | null;

const movesDiv = document.querySelector(".movetable-tablewrapper")!;
const movesTable = movesDiv.querySelector("table");

// need this for @media queries
let enginesAmount = 0;

const formatter = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const userCustomOptions: UserOptions = {
  ptnml: true,
  elo: true,
  pairPerRow: undefined,
  drawBgOnEmptyCells: false,
  allowKeyboardShortcuts: true,
  agreementHighlight: true,
  pgnFetch: true,
  addLinksToGameSchedule: false,
};

const userCustomOptionsDefault: UserOptions = {
  ptnml: true,
  elo: true,
  pairPerRow: undefined,
  drawBgOnEmptyCells: false,
  allowKeyboardShortcuts: true,
  agreementHighlight: true,
  pgnFetch: true,
  addLinksToGameSchedule: false,
} as const;

const PairsObj = {
  DoubleWin: "ccc-double-win",
  Win: "ccc-win",
  Draw: "ccc-draw",
  Loss: "ccc-loss",
  DoubleLoss: "ccc-double-loss",
} as const;

// @ts-ignore
const browserPrefix: Browsers = chrome?.storage ? chrome : browser;

const loadUserSettings = (function (): void {
  try {
    browserPrefix.storage.local
      .get("elo" as keyof UserOptions)
      .then(({ elo }: Partial<UserOptions>) => {
        userCustomOptions.elo = elo ?? userCustomOptionsDefault.elo;
      });

    browserPrefix.storage.local
      .get("ptnml" as keyof UserOptions)
      .then((result: Partial<UserOptions>) => {
        userCustomOptions.ptnml =
          result.ptnml ?? userCustomOptionsDefault.ptnml;
      });

    browserPrefix.storage.local
      .get("pairPerRow" as keyof UserOptions)
      .then((result: Partial<UserOptions>) => {
        userCustomOptions.pairPerRow =
          result.pairPerRow ?? userCustomOptionsDefault.pairPerRow;
        applyStylesToGrid();
      });

    browserPrefix.storage.local
      .get("drawBgOnEmptyCells" as keyof UserOptions)
      .then((result: Partial<UserOptions>) => {
        userCustomOptions.drawBgOnEmptyCells =
          result.drawBgOnEmptyCells ??
          userCustomOptionsDefault.drawBgOnEmptyCells;

        applyStylesToEmptyCells();
      });

    browserPrefix.storage.local
      .get("allowKeyboardShortcuts")
      .then((result: Partial<UserOptions>) => {
        userCustomOptions.allowKeyboardShortcuts =
          result.allowKeyboardShortcuts ??
          userCustomOptionsDefault.allowKeyboardShortcuts;
      });
  } catch (e: any) {
    console.log(e.message);
  }
})();

// * observers
observeOpenCrossTable();

let spaceKeyPressed = false;

const engineImages: HTMLImageElement[] = [];

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

    createEnginesNames();

    const modal = document.querySelector(".modal-vue-modal-content");
    const images = modal?.querySelectorAll("img");

    // @ts-ignore
    engineImages.push(...Array.from(images ?? []));

    activeCells.forEach(convertCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

function convertCell(cell: HTMLTableCellElement): void {
  try {
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

    const additionalInfoWrapper = createAdvancedStats(stats, index_1, index_2);
    cell.append(additionalInfoWrapper);

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

function observeOpenCrossTable(): void {
  const observer = new MutationObserver((entries) => {
    const modal = document.querySelector(".modal-vue-modal");
    if (!modal) return;

    queueMicrotask(crossTableBtnClickHandler);
  });

  observer.observe(mainContainer, {
    childList: true,
  });
}

// live cross table update
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

      wrappers?.forEach((wrapper: Element) => {
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
function getStats(scoresArray: ResultAsScore[]): [PTNML, WDL, AdditionalStats] {
  try {
    const wdlArray: WDL = [0, 0, 0]; // W D L in that order
    scoresArray.forEach((score) => {
      // score is either 1 0 -1
      // so by doing this we automatically
      // increment correct value
      wdlArray[1 - score] += 1;
    });

    // to get rid of an unfinished pair
    if (scoresArray.length % 2 === 1) scoresArray.pop();
    const ptnml: PTNML = [0, 0, 0, 0, 0]; // ptnml(0-2)

    const stats: AdditionalStats = {
      longestLossless: 0,
      longestWinStreak: 0,
      pairsRatio: 0,
      performancePercent: 0,
      longestWinless: 0,
      highestScore: 0,
    };

    let highestScore = 0;
    let currentScore = 0;

    for (let i = 0; i < scoresArray.length; i++) {
      const cur = scoresArray[i];

      currentScore += cur;
      // update after finished pair
      if (i % 2 === 1) {
        highestScore = Math.max(currentScore, highestScore);
      }
    }

    // lossless
    let longesLosslessRecord = 0;
    let longesLosslessCurrent = 0;

    // win streak
    let longestWinRecord = 0;
    let longestWinCurrent = 0;

    // winless
    let longestWinlessRecord = 0;
    let longestWinlessCurrent = 0;

    for (let i = 0; i < scoresArray.length; i += 2) {
      const first = scoresArray[i];
      const second = scoresArray[i + 1];
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
    stats.highestScore = highestScore;

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
): PairValues {
  const pairScore = lastResult + currentResult;

  if (pairScore === 2) return PairsObj.DoubleWin;
  if (pairScore === 1) return PairsObj.Win;
  if (pairScore === 0) return PairsObj.Draw;
  if (pairScore === -1) return PairsObj.Loss;
  return PairsObj.DoubleLoss;
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

  // l.classList.add("ccc-loss-font");
  l.classList.add("loss");
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

  if (!crossTableModal) return;
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
    switchLabelHandler("elo");
  });

  eloLabel.addEventListener("keydown", (e) => {
    if (e.code !== "Enter") return;

    eloLabel.querySelector("input")!.checked = !userCustomOptions.elo;
    switchLabelHandler("elo");
  });

  ptnmlLabel.addEventListener("change", () => {
    switchLabelHandler("ptnml");
  });

  ptnmlLabel.addEventListener("keydown", (e) => {
    if (e.code !== "Enter") return;

    ptnmlLabel.querySelector("input")!.checked = !userCustomOptions.ptnml;
    switchLabelHandler("ptnml");
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

  // ptnmlElement.textContent = `${ptnml[0]}, ${ptnml[1]}, ${ptnml[2]}, ${ptnml[3]}, ${ptnml[4]}`;
  ptnmlHeader.title = " LL, LD, WL/DD, WD, WW ";
  createPTNMLEntries(ptnmlElement, ptnml);

  ptnmlElement.classList.add("ccc-ptnml");

  ptnmlWrapper.append(ptnmlHeader, ptnmlElement);

  return ptnmlWrapper;
}

function createPTNMLEntries(element: HTMLDivElement, ptnml: PTNML): void {
  const ll = document.createElement("p");
  const ld = document.createElement("p");
  const wldd = document.createElement("p");
  const wd = document.createElement("p");
  const ww = document.createElement("p");

  ll.textContent = `${ptnml[0]},`;
  ll.title = "L+L";

  ld.textContent = `${ptnml[1]},`;
  ld.title = "L+D";

  wldd.textContent = `${ptnml[2]},`;
  wldd.title = "W+L / D+D";

  wd.textContent = `${ptnml[3]},`;
  wd.title = "W+D";

  ww.textContent = `${ptnml[4]}`;
  ww.title = "W+W";

  element.append(ll, ld, wldd, wd, ww);
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

function createAdvancedStats(
  stats: AdditionalStats,
  index_1: number,
  index_2: number
) {
  const additionalStatsBtn = document.createElement("div");
  additionalStatsBtn.classList.add("ccc-info-button");

  const svg = createSVGCaret();
  additionalStatsBtn.append(svg);

  additionalStatsBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const statsElementBackdrop = document.createElement("div");
    statsElementBackdrop.classList.add("ccc-info-backdrop");

    statsElementBackdrop.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.target !== statsElementBackdrop) return;
      additionalStatsBtn.removeChild(statsElementBackdrop);
    });

    const infoElement = handleStatElementCreation(stats, index_1, index_2);

    statsElementBackdrop.append(infoElement);

    additionalStatsBtn.append(statsElementBackdrop);
  });

  return additionalStatsBtn;
}

function createSVGCaret() {
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
  return iconSvg;
}

function handleStatElementCreation(
  stats: AdditionalStats,
  index_1: number,
  index_2: number
) {
  const infoElement = document.createElement("div");
  infoElement.classList.add("ccc-info-panel");
  infoElement.innerHTML = "";

  const waveContainer = createWaveContainer();
  infoElement.append(waveContainer);

  const p1 = createAdditionalStatRow(
    "Longest lossless streak: ",
    `${stats.longestLossless} pairs`
  );
  const p2 = createAdditionalStatRow(
    "Longest win streak: ",
    `${stats.longestWinStreak} pairs`
  );
  const p3 = createAdditionalStatRow(
    "Longest winless streak: ",
    `${stats.longestWinless} pairs`
  );

  const p4 = createAdditionalStatRow(
    "Performance: ",
    `${formatter.format(stats.performancePercent)}%`
  );
  const p5 = createAdditionalStatRow(
    "Pairs Ratio: ",
    `${formatter.format(stats.pairsRatio)}`
  );

  const p6 = createAdditionalStatRow(
    "Highest score: ",
    `[+${stats.highestScore}]`
  );

  const opponentsDiv = document.createElement("div");
  opponentsDiv.classList.add("ccc-opponents-div");

  const pVs = document.createElement("p");
  pVs.textContent = "vs";

  const img_1 = document.createElement("img");
  const img_2 = document.createElement("img");

  img_1.src = engineImages[index_1].src;
  img_1.alt = engineImages[index_1].alt;

  img_2.src = engineImages[index_2].src;
  img_2.alt = engineImages[index_2].alt;

  opponentsDiv.append(img_2, pVs, img_1);

  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-info-main");

  wrapper.append(opponentsDiv);
  wrapper.append(
    p1,
    p2,
    p3,
    p5,
    p4
    //  p6
  );
  infoElement.append(wrapper);

  return infoElement;
}

function createWaveContainer() {
  const waveContainer = document.createElement("div");
  const waveFiller = document.createElement("div");
  const wave = document.createElement("div");

  const xMark = document.createElement("button");
  xMark.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 384 512"><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>`;
  xMark.classList.add("ccc-x-mark");

  waveFiller.append(xMark);

  xMark.addEventListener("click", (e) => {
    e.stopPropagation();

    const statsModal = document.querySelector(".ccc-info-backdrop");
    if (!statsModal) return;
    const infoBtn = statsModal.parentNode;
    infoBtn?.removeChild(statsModal);
  });

  waveContainer.classList.add("ccc-wave-container");
  waveFiller.classList.add("ccc-wave-filler");
  wave.classList.add("ccc-wave");

  wave.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
    <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" class="shape-fill"></path>
  </svg>`;

  waveContainer.append(waveFiller, wave);
  return waveContainer;
}

function createAdditionalStatRow(info: string, stat: string) {
  const row = document.createElement("div");
  const pInfo = document.createElement("p");
  const pStat = document.createElement("p");

  row.classList.add("ccc-stat-row");
  pInfo.classList.add("ccc-stat-info-text");
  pStat.classList.add("ccc-stat-info-stat");

  pInfo.textContent = info;
  pStat.textContent = stat;

  row.append(pInfo, pStat);
  return row;
}

function createEnginesNames() {
  try {
    const engines = document.querySelectorAll(".crosstable-name");

    if (!engines) return;

    const enginesNames: string[] = [];
    engines.forEach((engine) => {
      enginesNames.push(engine.textContent!.replace("\n", "").trim());
    });

    const crossTable = document.querySelector(".crosstable-crosstable");
    if (!crossTable) return;

    const standingsRow = crossTable.querySelector("tr")!;
    const enginesRows = standingsRow.querySelectorAll(
      ".font-extra-faded-white"
    );

    enginesRows.forEach((row, index) => {
      row.textContent = `${index + 1} ${enginesNames[index]}`;
    });
  } catch (e: any) {
    console.log(e?.message);
  }
}

function switchLabelHandler(field: keyof OnlyBoolean<UserOptions>) {
  userCustomOptions[field] = !userCustomOptions[field];

  browserPrefix.storage.local
    .set({ [field]: userCustomOptions[field] })
    .then(convertCrossTable);
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
    userCustomOptions.drawBgOnEmptyCells ? "" : "transparent"
  );
}

function applyStylesToGrid() {
  document.body.style.setProperty(
    "--custom-column-amount",
    `${userCustomOptions.pairPerRow ? userCustomOptions.pairPerRow * 2 : ""}`
  );
}

// @ts-ignore
function removeChildNodes(
  parentNode: Element | HTMLElement | ParentNode | ChildNode
): void {
  while (parentNode.firstChild) {
    parentNode.removeChild(parentNode.firstChild);
  }
}

// @ts-ignore
function removeNode(
  childNode: Element | HTMLElement | ParentNode | ChildNode
): void {
  childNode.parentNode?.removeChild(childNode);
}

// * ----------------------------
// * event handlers && event listeners

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

  // enable/disable keyboard shortcuts
  if (e.code === "KeyU" && e.shiftKey && e.ctrlKey) {
    toggleAllowKeyboardShortcuts(false);

    return;
  }

  // open crosstable
  if (userCustomOptions.allowKeyboardShortcuts && e.code === "KeyC") {
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
  if (userCustomOptions.allowKeyboardShortcuts && e.code === "KeyS") {
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
  if (
    userCustomOptions.allowKeyboardShortcuts &&
    e.code === "KeyG" &&
    e.shiftKey
  ) {
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

  crossTableBtn.click();

  queueMicrotask(crossTableBtnClickHandler);
}

function openCrossTableFromOtherTab() {
  const divWithBtn = document.querySelectorAll(
    ".selection-panel-container + div"
  )[2];

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
    } as Partial<UserOptions>)
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

function crossTableBtnClickHandler(): void {
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
    console.log(e.message);
  }
}

// * elo calculation
// these formulas are taken from https://3dkingdoms.com/chess/elo.htm
// and I have no idea how they work
function calculateEloFromPercent(percent: number): string {
  const percentage = percent / 100;
  const eloDiff = (-400 * Math.log(1 / percentage - 1)) / Math.LN10;

  let Sign = "";
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
  const a: number = (8 * (Math.PI - 3)) / (3 * Math.PI * (4 - Math.PI));
  const y: number = Math.log(1 - x * x);
  const z: number = 2 / (Math.PI * a) + y / 2;

  const ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);

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
  const total = wins + draws + losses;
  const winP = wins / total;
  const drawP = draws / total;
  const lossP = losses / total;
  const percentage = (wins + draws * 0.5) / total;
  const winsDev = winP * Math.pow(1 - percentage, 2);
  const drawsDev = drawP * Math.pow(0.5 - percentage, 2);
  const lossesDev = lossP * Math.pow(0 - percentage, 2);
  const stdDeviation =
    Math.sqrt(winsDev + drawsDev + lossesDev) / Math.sqrt(total);

  const confidenceP = 0.95;
  const minConfidenceP = (1 - confidenceP) / 2;
  const maxConfidenceP = 1 - minConfidenceP;
  const devMin = percentage + phiInv(minConfidenceP) * stdDeviation;
  const devMax = percentage + phiInv(maxConfidenceP) * stdDeviation;

  const difference =
    calculateEloDifference(devMax) - calculateEloDifference(devMin);

  const errorMargin = formatter.format(difference / 2);

  return `±${errorMargin}`;
}

// ! --------------------
// ! dev ----------------
type CCCEventInfo = {
  eventName: string | null;
  gameNumber: number | null;
};

const eventInfo: CCCEventInfo = {
  eventName: null,
  gameNumber: null,
};
// ! dev ----------------
// ! --------------------
// ! --------------------
// ! --------------------
// ! dev ----------------

chrome.runtime.onMessage.addListener(function (
  message: RuntimeMessage,
  sender,
  senderResponse
) {
  try {
    const { type, payload } = message;

    // handled in highlight.ts
    if (type !== "toggle_option" && type !== "event_name") {
      return true;
    }

    if (type === "event_name") {
      eventInfo.eventName = payload?.eventName ?? "";
      return true;
    }
    if (!payload?.optionToToggle) return;

    const { optionToToggle: option } = payload;

    userCustomOptions[option] = !userCustomOptions[option];

    if (option === "elo" || option === "ptnml") {
      const crossTableModal = document.querySelector(
        ".modal-vue-modal-content"
      );
      if (!crossTableModal) return true;

      convertCrossTable();
    } else if (option === "allowKeyboardShortcuts") {
      toggleAllowKeyboardShortcuts(true);
    } else if (option === "drawBgOnEmptyCells") {
      applyStylesToEmptyCells();
    }

    return true;
  } catch (e: any) {
    console.log(e?.message);
  }
});

function toggleAllowKeyboardShortcuts(reversed: boolean) {
  const { allowKeyboardShortcuts: allow } = userCustomOptions;
  browserPrefix.storage.local
    .set({
      allowKeyboardShortcuts: reversed ? allow : !allow,
    })
    .then(() => {
      userCustomOptions.allowKeyboardShortcuts = reversed ? allow : !allow;
    });
}

observeScheduleClick();
function observeScheduleClick() {
  const container = standingsDiv.querySelector(
    ".selection-panel-container + div"
  )!;

  const observer = new MutationObserver(() => {
    if (!userCustomOptions.addLinksToGameSchedule) return;
    const scheduleContainer: HTMLDivElement | null = container.querySelector(
      ".schedule-container"
    );

    if (!scheduleContainer) return;

    createGameScheduleLinks(scheduleContainer);
  });

  observer.observe(container, {
    childList: true,
  });
}

function createGameScheduleLinks(container: HTMLDivElement) {
  const links = container.querySelectorAll(".schedule-gameLink");

  links.forEach((link, index) => {
    const baseURL = "https://www.chess.com/computer-chess-championship#";
    const src = `${baseURL}event=${eventInfo.eventName}&game=${index + 1}`;

    const anchor = document.createElement("a");
    anchor.href = src;

    anchor.classList.add("ccc-game-link");

    link.append(anchor);
  });
}
