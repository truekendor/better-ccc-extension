const standingsDiv = document.getElementById("bottomtable-bottomtable");

// panel with vote/standings/schedule buttons
const btnPanel = standingsDiv.querySelector(".selection-panel-container");
const standingsBtn = btnPanel.querySelectorAll("span")[1];

let crossTableBtn: HTMLButtonElement;
let crossTableElements: NodeListOf<HTMLTableCellElement>;

standingsBtn.addEventListener("click", standingsBtnClickHandler);

function standingsBtnClickHandler() {
  try {
    console.log("click on standing btn");

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

  console.log("CLICK CROSSTABLE");
  console.log("CROSSTABLE ELEMS", crossTableElements);

  convertCrossTable();
}

function convertCrossTable() {
  try {
    let enginesAmount = 0;

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

function parseCell(cell: HTMLTableCellElement) {
  // header with result (105.5 - 100.5[+5])
  const cellHeader: HTMLDivElement = cell.querySelector(
    ".crosstable-head-to-head"
  );

  // result table for h2h vs one opponent
  const crossTableCell: HTMLDivElement = cell.querySelector(
    ".crosstable-result-wrapper"
  );

  crossTableCell.classList.add("ccc-cell-grid");

  // each div with game result in it
  const gameResultsDivs: NodeListOf<HTMLDivElement> =
    crossTableCell.querySelectorAll(".crosstable-result");

  let lastResult: ResultAsScore = undefined;

  gameResultsDivs.forEach((result, index) => {
    // ID needed to overwrite default CCC styles
    result.id = "ccc-result";

    if (index % 2 === 0) {
      result.classList.add("ccc-border-left");

      lastResult = getResultFromGame(result);
    } else {
      result.classList.add("ccc-border-right");

      const currentResult = getResultFromGame(result);
      const pairResult = getClassNameForPair(lastResult, currentResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);

      result.classList.add(pairResult);
      gameResultsDivs[index - 1].classList.add(pairResult);
    }
  });

  // results but in -1/0/+1 array
  // * easy
  // const resultsArray = countResult(gameResultsDivs);
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

// ! _________________________
// waitForLoad();

// async function waitForLoad() {
//   await loadPromise;

//   await new Promise((res) => {
//     console.log("TIMER 1");
//     setTimeout(res, 100);
//   });

//   main();
// }

// // document load ends when loader modal is closed
// // this promise will fire when loader close event occurs
// // DOMContentLoad event doesn't work as expected
// const loadPromise = new Promise((res) => {
//   console.log("YES LOADER ==================================");

//   const cpuChampsMain = document.querySelector(".cpu-champs-page-main");
//   const loader = document.querySelector(".cpu-champs-page-loader-wrapper");

//   const observer = new MutationObserver((entries) => {
//     entries.forEach((e) => {
//       if (e.removedNodes[0] === loader) {
//         res(true);
//         observer.disconnect();
//       }
//     });
//   });

//   observer.observe(cpuChampsMain, {
//     childList: true,
//   });
// });
