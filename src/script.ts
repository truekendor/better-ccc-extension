const standingsDiv = document.getElementById("bottomtable-bottomtable");

const content = document.getElementById("righttable-content");
const chat = document.querySelector("chat-chat");

// panel with vote/standings/schedule buttons
const btnPanel = standingsDiv.querySelector(".selection-panel-container");
// button with text "Standings"
const standingsBtn = btnPanel.querySelectorAll("span")[1];

let crossTableBtn: HTMLButtonElement;
let crossTableElements: NodeListOf<HTMLTableCellElement>;

let crossTableModal: HTMLDivElement;
let crossTableWithScroll: HTMLDivElement = undefined;

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
};

function loadUserSettings() {
  try {
    chrome.storage.local.get("elo").then((result: Partial<Options>) => {
      userCustomOptions.elo = result.elo ?? true;
    });

    chrome.storage.local.get("ptnml").then((result: Partial<Options>) => {
      userCustomOptions.ptnml = result.ptnml ?? true;
    });

    chrome.storage.local.get("pairPerRow").then((result: Partial<Options>) => {
      userCustomOptions.pairPerRow = result.pairPerRow ?? undefined;
      document.body.style.setProperty(
        "--custom-column-amount",
        `${
          userCustomOptions.pairPerRow ? userCustomOptions.pairPerRow * 2 : ""
        }`
      );
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

interface Options {
  ptnml: boolean;
  elo: boolean;
  pairPerRow: number;
}

// * ---------------
// * extension logic
function convertCrossTable() {
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
      // and this function will handle live cross table update
      observeInitial();
    }

    activeCells.forEach(convertCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

// observes prematurely opened cross table
function observeInitial() {
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
function observeEmpty(cell: HTMLTableCellElement) {
  try {
    const observer = new MutationObserver(() => {
      observer.disconnect();

      // convertCrossTable()
      convertCell(cell);
    });

    observer.observe(cell, {
      childList: true,
    });
  } catch (e: any) {
    console.log(e.message);
  }
}

function convertCell(cell: HTMLTableCellElement) {
  try {
    // header with result --> 205 - 195 [+10]
    const cellHeader: HTMLDivElement = cell.querySelector(
      ".crosstable-head-to-head"
    );

    if (!cellHeader) {
      // observing empty cell for live changes
      observeEmpty(cell);
      return;
    }

    cellHeader.id = "ccc-cell-header";

    // result table for h2h vs one opponent
    const crossTableCell: HTMLDivElement = cell.querySelector(
      ".crosstable-result-wrapper"
    );

    addClassNamesCrossTable(crossTableCell);
    const scoresArray = calculateScores(crossTableCell);

    const [ptnml, wdlArray] = getStats(scoresArray);

    // * create stats
    const ptnmlWrapper = createPTNMLStatHeader(ptnml);
    const wdlWrapper = createWDLStatHeader(wdlArray);

    // * add stats
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
function liveUpdate() {
  try {
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
function getStats(arr: ResultAsScore[]): [PTNML, WDL] {
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

    for (let i = 0; i < arr.length; i += 2) {
      const first = arr[i];
      const second = arr[i + 1];
      const res = first + second;

      if (res === 2) {
        ptnml[4] += 1;
      } else if (res === 1) {
        ptnml[3] += 1;
      } else if (res === 0) {
        ptnml[2] += 1;
      } else if (res === -1) {
        ptnml[1] += 1;
      } else {
        ptnml[0] += 1;
      }
    }

    return [ptnml, wdlArray];
  } catch (e: any) {
    console.log(e.message);
  }
}

function getResultFromNode(node: HTMLDivElement) {
  if (node.classList.contains("win")) return 1;
  if (node.classList.contains("draw")) return 0;
  return -1;
}

function getClassNameForPair(
  lastResult: ResultAsScore,
  currentResult: ResultAsScore
) {
  const pairScore = lastResult + currentResult;

  if (pairScore === 2) return Pairs.DoubleWin;
  if (pairScore === 1) return Pairs.Win;
  if (pairScore === 0) return Pairs.Draw;
  if (pairScore === -1) return Pairs.Loss;
  return Pairs.DoubleLoss;
}

function createStatWrapperElement() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-stat-wrapper");

  return wrapper;
}

function createWLDEloElement(wdl: WDL) {
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
  const winrateElement = document.createElement("p");
  winrateElement.classList.add("ccc-winrate-percentage");
  // winrateElement.textContent = ` ${percent}%`;

  let elo;
  let margin;
  let eloWrapper;

  if (numberOfGames >= 2) {
    elo = calculateEloFromPercent(parseFloat(percent));
    margin = calculateErrorMargin(wdl[0], wdl[1], wdl[2]);
    eloWrapper = createEloAndMarginElement(elo, margin);
  }

  wdlElement.append(w, d, l);

  if (eloWrapper) {
    wdlElement.append(eloWrapper);
  }

  wdlElement.append(winrateElement);

  return wdlElement;
}

function createEloAndMarginElement(elo: string, margin: string) {
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
) {
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

// handles creation of customization inputs
function createOptionInputs() {
  const crossTableModal: HTMLDivElement = document.querySelector(
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

    chrome.storage.local
      .set({ elo: userCustomOptions.elo })
      .then(convertCrossTable);
  });

  ptnmlLabel.addEventListener("change", () => {
    userCustomOptions.ptnml = !userCustomOptions.ptnml;

    chrome.storage.local
      .set({ ptnml: userCustomOptions.ptnml })
      .then(convertCrossTable);
  });

  crossTableModal.append(wrapper);
}

function createPTNMLStatHeader(ptnml: PTNML) {
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

function createWDLStatHeader(wdlArray: WDL) {
  const wdlWrapper = createStatWrapperElement();
  wdlWrapper.classList.add("ccc-wdl-wrapper");

  const wdlElement = createWLDEloElement(wdlArray);

  wdlWrapper.append(wdlElement);
  return wdlWrapper;
}

function createRowsForm() {
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

    chrome.storage.local.set({ pairPerRow: value || "" });
    document.body.style.setProperty(
      "--custom-column-amount",
      `${value ? value * 2 : ""}`
    );
  });

  return formElement;
}

function createSwitchLabel(text: string, field: LabelForField) {
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

function addClassNamesCrossTable(crossTableCell: HTMLDivElement) {
  crossTableCell.classList.add("ccc-cell-grid");
  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }
}

function calculateScores(crossTableCell: HTMLDivElement) {
  const gameResultsDivs: NodeListOf<HTMLDivElement> =
    crossTableCell.querySelectorAll(".crosstable-result");

  const scoresArray: ResultAsScore[] = [];
  let lastResult: ResultAsScore = undefined;

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

// * ----------------------------
// * event handlers and listeners

window.addEventListener("keydown", keydownHandler);

// close modals on ESC
function keydownHandler(e: KeyboardEvent) {
  if (e.code !== "Escape") return;

  handleCloseModalOnKeydown();
}

function handleCloseModalOnKeydown() {
  const crossTableModal = document.querySelector(".modal-vue-modal-content");
  const tournamentsList = document.querySelector(".bottomtable-resultspopup");
  const engineDetailsPanel = document.querySelector(".enginedetails-panel");

  if (crossTableModal) {
    const closeBtn: HTMLButtonElement =
      crossTableModal.querySelector(".modal-close");
    closeBtn.click();
    return;
  }
  if (tournamentsList) {
    const closeDiv: HTMLDivElement = document.querySelector(
      ".bottomtable-event-name-wrapper"
    );
    closeDiv.click();
    return;
  }
  if (engineDetailsPanel) {
    const closeBtn: HTMLIFrameElement = document.querySelector(
      "#enginedetails-close"
    );

    closeBtn?.click();
    return;
  }
}

function standingsBtnClickHandler() {
  try {
    crossTableBtn = document
      .getElementById("standings-standings")
      .querySelector("button");

    crossTableBtn.addEventListener("click", crossTableBtnClickHandler);
  } catch (e: any) {
    console.log(e.message);
  }
}

function crossTableBtnClickHandler() {
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
function calculateEloFromPercent(percent: number) {
  var percentage = percent / 100;
  var eloDiff = (-400 * Math.log(1 / percentage - 1)) / Math.LN10;

  var Sign = "";
  if (eloDiff > 0) {
    Sign = "+";
  }

  const eloDiffAsString = formatter.format(eloDiff);

  return `${Sign}${eloDiffAsString}`;
}

function calculateEloDifference(percentage: number) {
  return (-400 * Math.log(1 / percentage - 1)) / Math.LN10;
}

function CalculateInverseErrorFunction(x: number) {
  var pi = Math.PI;
  var a = (8 * (pi - 3)) / (3 * pi * (4 - pi));
  var y = Math.log(1 - x * x);
  var z = 2 / (pi * a) + y / 2;

  var ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);

  if (x < 0) return -ret;

  return ret;
}

function phiInv(p: number) {
  return Math.sqrt(2) * CalculateInverseErrorFunction(2 * p - 1);
}

function calculateErrorMargin(wins: number, draws: number, losses: number) {
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
