const standingsDiv = document.getElementById("bottomtable-bottomtable");

// panel with vote/standings/schedule buttons
const btnPanel = standingsDiv.querySelector(".selection-panel-container");
// Button with text "Standings"
const standingsBtn = btnPanel.querySelectorAll("span")[1];

let crossTableBtn: HTMLButtonElement;
let crossTableElements: NodeListOf<HTMLTableCellElement>;

// need this for @media queries
let enginesAmount = 0;

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
  const crossTableModal = document.querySelector(".modal-vue-modal-content");

  crossTableElements = crossTableModal.querySelectorAll(
    ".crosstable-results-cell"
  );

  convertCrossTable();
}

function convertCrossTable() {
  try {
    enginesAmount = 0;
    // @ts-ignore
    const activeCells = [...crossTableElements].filter((el) => {
      if (el.classList.contains("crosstable-empty")) {
        enginesAmount++;
        return;
      }
      return el;
    });

    activeCells.forEach(parseCell);
  } catch (e: any) {
    console.log(e.message);
  }
}

enum Pairs {
  DoubleWin = "ccc-double-win",
  Win = "ccc-win",
  Draw = "ccc-draw",
  Loss = "ccc-loss",
  DoubleLoss = "ccc-double-loss",
}

type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];

function parseCell(cell: HTMLTableCellElement) {
  // header with result --> 205 - 195 [+10]
  const cellHeader: HTMLDivElement = cell.querySelector(
    ".crosstable-head-to-head"
  );

  cellHeader.id = "ccc-cell-header";

  // result table for h2h vs one opponent
  const crossTableCell: HTMLDivElement = cell.querySelector(
    ".crosstable-result-wrapper"
  );

  if (enginesAmount === 2) {
    crossTableCell.classList.add("one-v-one");
  } else if (enginesAmount > 8) {
    crossTableCell.classList.add("many");
  }

  crossTableCell.classList.add("ccc-cell-grid");

  // each div with game result in it
  const gameResultsDivs: NodeListOf<HTMLDivElement> =
    crossTableCell.querySelectorAll(".crosstable-result");

  const scoresArray: ResultAsScore[] = [];
  let lastResult: ResultAsScore = undefined;

  gameResultsDivs.forEach((result, index) => {
    // ID needed to overwrite default CCC styles
    result.id = "ccc-result";

    if (index % 2 === 0) {
      result.classList.add("ccc-border-left");

      lastResult = getResultFromGame(result);
      scoresArray.push(lastResult);
    } else {
      result.classList.add("ccc-border-right");

      const currentResult = getResultFromGame(result);
      const pairResult = getClassNameForPair(lastResult, currentResult);
      scoresArray.push(currentResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);
    }
  });

  // create and add ptnml stat
  const ptnmlWrapper = createStatWrapper();
  const [ptnml, wdlArray] = getStats(scoresArray);
  const ptnmlElement = document.createElement("div");

  const ptnmlHeader = document.createElement("div");
  ptnmlHeader.id = "ptnml-header";
  ptnmlHeader.textContent = "Ptnml(0-2)";

  ptnmlElement.textContent = `${ptnml[0]}, ${ptnml[1]}, ${ptnml[2]}, ${ptnml[3]}, ${ptnml[4]}`;
  ptnmlElement.classList.add("ccc-ptnml");

  ptnmlWrapper.append(ptnmlHeader, ptnmlElement);

  // create and add WDL stat
  const wdlWrapper = createStatWrapper();
  const wdlElement = createWDLELement(wdlArray);
  wdlWrapper.append(wdlElement);

  cellHeader.append(wdlWrapper, ptnmlWrapper);

  const observer = new MutationObserver(() => {
    observer.disconnect();

    liveUpdate();
  });

  observer.observe(crossTableCell, {
    childList: true,
  });
}

function liveUpdate() {
  // let crossTableElements = document.querySelectorAll(
  //   ".crosstable-results-cell"
  // );

  // @ts-ignore
  const activeCells = [...crossTableElements].filter((el) => {
    if (el.classList.contains("crosstable-empty")) {
      enginesAmount++;
      return;
    }
    return el;
  });

  activeCells.forEach((cell) => {
    const header = cell.querySelector("#ccc-cell-header");
    // wrappers for custom stats
    const wrappers = cell.querySelectorAll(".ccc-stat-wrapper");

    wrappers.forEach((wrapper) => {
      header.removeChild(wrapper);
    });
  });

  convertCrossTable();
}

// * utils
function getStats(arr: ResultAsScore[]): [number[], WDL] {
  const wdlArray: WDL = [0, 0, 0]; // W D L in that order
  arr.forEach((score) => {
    // score is either 1 0 -1
    // so by doing this we automatically
    // increment correct value
    wdlArray[1 - score] += 1;
  });

  // to get rid of an unfinished pair
  if (arr.length % 2 === 1) arr.pop();
  const ptnml = [0, 0, 0, 0, 0]; // ptnml(0-2)

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
}

function getResultFromGame(node: HTMLDivElement) {
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

function handleCloseModalOnKeydown(e: KeyboardEvent) {
  if (e.code !== "Escape") return;
  const crossTableModal = document.querySelector(".modal-vue-modal-content");
  const tournamentsList = document.querySelector(".bottomtable-resultspopup");

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
}

function createStatWrapper() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("ccc-stat-wrapper");

  return wrapper;
}

function createWDLELement(wdl: WDL) {
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

  const winrateElement = document.createElement("p");

  const formatter = Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 1,
  });

  const points = wdl[0] + wdl[1] / 2;

  const percent = formatter.format((points / numberOfGames) * 100);

  winrateElement.textContent = ` | ${percent}%`;

  wdlElement.append(w, d, l, winrateElement);

  return wdlElement;
}

standingsBtn.addEventListener("click", standingsBtnClickHandler);
// window.addEventListener("keydown", handleCloseModalOnKeydown);
