var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var standingsDiv = document.getElementById("bottomtable-bottomtable");
// panel with vote/standings/schedule buttons
var btnPanel = standingsDiv.querySelector(".selection-panel-container");
// Button with text "Standings"
var standingsBtn = btnPanel.querySelectorAll("span")[1];
var crossTableBtn;
var crossTableElements;
// need this for @media queries
var enginesAmount = 0;
function standingsBtnClickHandler() {
    try {
        crossTableBtn = document
            .getElementById("standings-standings")
            .querySelector("button");
        crossTableBtn.addEventListener("click", crossTableBtnClickHandler);
    }
    catch (e) {
        console.log(e.message);
    }
}
function crossTableBtnClickHandler() {
    var crossTableModal = document.querySelector(".modal-vue-modal-content");
    crossTableElements = crossTableModal.querySelectorAll(".crosstable-results-cell");
    convertCrossTable();
}
function convertCrossTable() {
    try {
        enginesAmount = 0;
        // @ts-ignore
        var activeCells = __spreadArray([], crossTableElements, true).filter(function (el) {
            if (el.classList.contains("crosstable-empty")) {
                enginesAmount++;
                return;
            }
            return el;
        });
        activeCells.forEach(parseCell);
    }
    catch (e) {
        console.log(e.message);
    }
}
var Pairs;
(function (Pairs) {
    Pairs["DoubleWin"] = "ccc-double-win";
    Pairs["Win"] = "ccc-win";
    Pairs["Draw"] = "ccc-draw";
    Pairs["Loss"] = "ccc-loss";
    Pairs["DoubleLoss"] = "ccc-double-loss";
})(Pairs || (Pairs = {}));
function parseCell(cell) {
    // header with result --> 205 - 195 [+10]
    var cellHeader = cell.querySelector(".crosstable-head-to-head");
    cellHeader.id = "ccc-cell-header";
    // result table for h2h vs one opponent
    var crossTableCell = cell.querySelector(".crosstable-result-wrapper");
    if (enginesAmount === 2) {
        crossTableCell.classList.add("one-v-one");
    }
    else if (enginesAmount > 8) {
        crossTableCell.classList.add("many");
    }
    crossTableCell.classList.add("ccc-cell-grid");
    // each div with game result in it
    var gameResultsDivs = crossTableCell.querySelectorAll(".crosstable-result");
    var scoresArray = [];
    var lastResult = undefined;
    gameResultsDivs.forEach(function (result, index) {
        // ID needed to overwrite default CCC styles
        result.id = "ccc-result";
        if (index % 2 === 0) {
            result.classList.add("ccc-border-left");
            lastResult = getResultFromGame(result);
            scoresArray.push(lastResult);
        }
        else {
            result.classList.add("ccc-border-right");
            var currentResult = getResultFromGame(result);
            var pairResult = getClassNameForPair(lastResult, currentResult);
            scoresArray.push(currentResult);
            result.classList.add(pairResult);
            gameResultsDivs[index - 1].classList.add(pairResult);
            result.classList.add(pairResult);
            gameResultsDivs[index - 1].classList.add(pairResult);
        }
    });
    // create and add ptnml stat
    var ptnmlWrapper = createStatWrapper();
    var _a = getStats(scoresArray), ptnml = _a[0], wdlArray = _a[1];
    var ptnmlElement = document.createElement("div");
    var ptnmlHeader = document.createElement("div");
    ptnmlHeader.id = "ptnml-header";
    ptnmlHeader.textContent = "Ptnml(0-2)";
    ptnmlElement.textContent = "".concat(ptnml[0], ", ").concat(ptnml[1], ", ").concat(ptnml[2], ", ").concat(ptnml[3], ", ").concat(ptnml[4]);
    ptnmlElement.classList.add("ccc-ptnml");
    ptnmlWrapper.append(ptnmlHeader, ptnmlElement);
    // create and add WDL stat
    var wdlWrapper = createStatWrapper();
    var wdlElement = createWDLELement(wdlArray);
    wdlWrapper.append(wdlElement);
    cellHeader.append(wdlWrapper, ptnmlWrapper);
    var observer = new MutationObserver(function () {
        observer.disconnect();
        liveUpdate();
    });
    observer.observe(crossTableCell, {
        childList: true,
    });
}
function liveUpdate() {
    // @ts-ignore
    var activeCells = __spreadArray([], crossTableElements, true).filter(function (el) {
        if (el.classList.contains("crosstable-empty")) {
            enginesAmount++;
            return;
        }
        return el;
    });
    activeCells.forEach(function (cell) {
        var header = cell.querySelector("#ccc-cell-header");
        // wrappers for custom stats
        var wrappers = cell.querySelectorAll(".ccc-stat-wrapper");
        wrappers.forEach(function (wrapper) {
            header.removeChild(wrapper);
        });
    });
    convertCrossTable();
}
// * utils
function getStats(arr) {
    var wdlArray = [0, 0, 0]; // W D L in that order
    arr.forEach(function (score) {
        // score is either 1 0 -1
        // so by doing this we automatically
        // increment correct value
        wdlArray[1 - score] += 1;
    });
    // to get rid of an unfinished pair
    if (arr.length % 2 === 1)
        arr.pop();
    var ptnml = [0, 0, 0, 0, 0]; // ptnml(0-2)
    for (var i = 0; i < arr.length; i += 2) {
        var first = arr[i];
        var second = arr[i + 1];
        var res = first + second;
        if (res === 2) {
            ptnml[4] += 1;
        }
        else if (res === 1) {
            ptnml[3] += 1;
        }
        else if (res === 0) {
            ptnml[2] += 1;
        }
        else if (res === -1) {
            ptnml[1] += 1;
        }
        else {
            ptnml[0] += 1;
        }
    }
    return [ptnml, wdlArray];
}
function getResultFromGame(node) {
    if (node.classList.contains("win"))
        return 1;
    if (node.classList.contains("draw"))
        return 0;
    return -1;
}
function getClassNameForPair(lastResult, currentResult) {
    var pairScore = lastResult + currentResult;
    if (pairScore === 2)
        return Pairs.DoubleWin;
    if (pairScore === 1)
        return Pairs.Win;
    if (pairScore === 0)
        return Pairs.Draw;
    if (pairScore === -1)
        return Pairs.Loss;
    return Pairs.DoubleLoss;
}
function handleCloseModalOnKeydown(e) {
    if (e.code !== "Escape")
        return;
    var crossTableModal = document.querySelector(".modal-vue-modal-content");
    var tournamentsList = document.querySelector(".bottomtable-resultspopup");
    if (crossTableModal) {
        var closeBtn = crossTableModal.querySelector(".modal-close");
        closeBtn.click();
        return;
    }
    if (tournamentsList) {
        var closeDiv = document.querySelector(".bottomtable-event-name-wrapper");
        closeDiv.click();
        return;
    }
}
function createStatWrapper() {
    var wrapper = document.createElement("div");
    wrapper.classList.add("ccc-stat-wrapper");
    return wrapper;
}
function createWDLELement(wdl) {
    var numberOfGames = wdl.reduce(function (amount, prev) { return amount + prev; }, 0);
    var wdlElement = document.createElement("div");
    wdlElement.classList.add("ccc-wdl-container");
    var w = document.createElement("p");
    var d = document.createElement("p");
    var l = document.createElement("p");
    w.textContent = "+".concat(wdl[0]);
    d.textContent = "=".concat(wdl[1]);
    l.textContent = "-".concat(wdl[2], " ");
    // default CCC styles
    w.classList.add("win");
    d.classList.add("draw");
    // custom style for more contrast
    l.classList.add("ccc-loss-font");
    var winrateElement = document.createElement("p");
    var formatter = Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 1,
    });
    var points = wdl[0] + wdl[1] / 2;
    var percent = formatter.format((points / numberOfGames) * 100);
    winrateElement.textContent = " | ".concat(percent, "%");
    wdlElement.append(w, d, l, winrateElement);
    return wdlElement;
}
standingsBtn.addEventListener("click", standingsBtnClickHandler);
// window.addEventListener("keydown", handleCloseModalOnKeydown);
