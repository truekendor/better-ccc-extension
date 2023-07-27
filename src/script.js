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
var content = document.getElementById("righttable-content");
var chat = document.querySelector("chat-chat");
// panel with vote/standings/schedule buttons
var btnPanel = standingsDiv.querySelector(".selection-panel-container");
// button with text "Standings"
var standingsBtn = btnPanel.querySelectorAll("span")[1];
var crossTableBtn;
var crossTableElements;
var crossTableModal;
var crossTableWithScroll = undefined;
standingsBtn.addEventListener("click", standingsBtnClickHandler);
// need this for @media queries
var enginesAmount = 0;
var formatter = Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
});
var userCustomOptions = {
    ptnml: true,
    elo: true,
    pairPerRow: undefined,
};
function loadUserSettings() {
    try {
        chrome.storage.local.get("elo").then(function (result) {
            var _a;
            userCustomOptions.elo = (_a = result.elo) !== null && _a !== void 0 ? _a : true;
        });
        chrome.storage.local.get("ptnml").then(function (result) {
            var _a;
            userCustomOptions.ptnml = (_a = result.ptnml) !== null && _a !== void 0 ? _a : true;
        });
        chrome.storage.local.get("pairPerRow").then(function (result) {
            var _a;
            userCustomOptions.pairPerRow = (_a = result.pairPerRow) !== null && _a !== void 0 ? _a : undefined;
            document.body.style.setProperty("--custom-column-amount", "".concat(userCustomOptions.pairPerRow ? userCustomOptions.pairPerRow * 2 : ""));
        });
    }
    catch (e) {
        console.log(e.message);
    }
}
loadUserSettings();
var spaceKeyPressed = false;
// * typescript
var Pairs;
(function (Pairs) {
    Pairs["DoubleWin"] = "ccc-double-win";
    Pairs["Win"] = "ccc-win";
    Pairs["Draw"] = "ccc-draw";
    Pairs["Loss"] = "ccc-loss";
    Pairs["DoubleLoss"] = "ccc-double-loss";
})(Pairs || (Pairs = {}));
// * ---------------
// * extension logic
function convertCrossTable() {
    try {
        enginesAmount = 0;
        var optionsWrapper = document.querySelector(".ccc-options-wrapper");
        if (!optionsWrapper) {
            createOptionInputs();
        }
        // @ts-ignore
        var activeCells = __spreadArray([], crossTableElements, true).filter(function (el) {
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
    }
    catch (e) {
        console.log(e.message);
    }
}
// observes prematurely opened cross table
function observeInitial() {
    try {
        var initObserver_1 = new MutationObserver(function () {
            initObserver_1.disconnect();
            crossTableBtnClickHandler();
        });
        var modal = document.querySelector(".modal-vue-modal-container");
        if (modal) {
            initObserver_1.observe(modal, {
                childList: true,
                subtree: true,
            });
        }
    }
    catch (e) {
        console.log(e.message);
    }
}
// observes cells with no h2h records
function observeEmpty(cell) {
    try {
        var observer_1 = new MutationObserver(function () {
            observer_1.disconnect();
            // convertCrossTable()
            convertCell(cell);
        });
        observer_1.observe(cell, {
            childList: true,
        });
    }
    catch (e) {
        console.log(e.message);
    }
}
function convertCell(cell) {
    try {
        // header with result --> 205 - 195 [+10]
        var cellHeader = cell.querySelector(".crosstable-head-to-head");
        // TODO handle null observer
        if (!cellHeader) {
            observeEmpty(cell);
            return;
        }
        cellHeader.id = "ccc-cell-header";
        // result table for h2h vs one opponent
        var crossTableCell = cell.querySelector(".crosstable-result-wrapper");
        addClassNamesCrossTable(crossTableCell);
        var scoresArray = calculateScores(crossTableCell);
        var _a = getStats(scoresArray), ptnml = _a[0], wdlArray = _a[1];
        // * create stats
        var ptnmlWrapper = createPTNMLStatHeader(ptnml);
        var wdlWrapper = createWDLStatHeader(wdlArray);
        // * add stats
        handleCustomStat(cellHeader, wdlWrapper, ptnmlWrapper);
        var observer_2 = new MutationObserver(function () {
            observer_2.disconnect();
            liveUpdate();
        });
        // TODO change it to observe header scores
        // TODO NO, to observe the whole cell
        // TODO cause if there is no h2h games,
        // TODO there is no cells and headers to observe
        observer_2.observe(crossTableCell, {
            childList: true,
        });
    }
    catch (e) {
        console.log(e.message);
    }
}
// updates stats with each new game result
function liveUpdate() {
    try {
        var activeCells = __spreadArray([], crossTableElements, true).filter(function (el) {
            if (el.classList.contains("crosstable-empty")) {
                enginesAmount++;
                return;
            }
            return el;
        });
        if (activeCells.length === 0)
            return;
        // for each cell with games in it
        // find and remove all custom elements
        activeCells.forEach(function (cell) {
            var header = cell.querySelector("#ccc-cell-header");
            if (!header)
                return;
            // wrappers for custom stats
            var wrappers = cell.querySelectorAll(".ccc-stat-wrapper");
            wrappers === null || wrappers === void 0 ? void 0 : wrappers.forEach(function (wrapper) {
                header === null || header === void 0 ? void 0 : header.removeChild(wrapper);
            });
        });
        convertCrossTable();
    }
    catch (e) {
        console.log(e.message);
    }
}
// * -------------
// * utils
function getStats(arr) {
    try {
        var wdlArray_1 = [0, 0, 0]; // W D L in that order
        arr.forEach(function (score) {
            // score is either 1 0 -1
            // so by doing this we automatically
            // increment correct value
            wdlArray_1[1 - score] += 1;
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
        return [ptnml, wdlArray_1];
    }
    catch (e) {
        console.log(e.message);
    }
}
function getResultFromNode(node) {
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
function createStatWrapperElement() {
    var wrapper = document.createElement("div");
    wrapper.classList.add("ccc-stat-wrapper");
    return wrapper;
}
function createWLDEloElement(wdl) {
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
    l.classList.add("ccc-margin-right");
    var points = wdl[0] + wdl[1] / 2;
    var percent = formatter.format((points / numberOfGames) * 100);
    var winrateElement = document.createElement("p");
    winrateElement.classList.add("ccc-winrate-percentage");
    // winrateElement.textContent = ` ${percent}%`;
    var elo;
    var margin;
    var eloWrapper;
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
function createEloAndMarginElement(elo, margin) {
    var wrapper = document.createElement("div");
    var eloElement = document.createElement("p");
    var marginElement = document.createElement("p");
    wrapper.classList.add("ccc-elo-wrapper");
    eloElement.classList.add("ccc-elo");
    eloElement.classList.add(parseInt(elo) >= 0 ? "ccc-elo-positive" : "ccc-elo-negative");
    eloElement.textContent = "".concat(elo);
    marginElement.textContent = "".concat(margin);
    marginElement.classList.add("ccc-error-margin");
    wrapper.append(eloElement, marginElement);
    return wrapper;
}
// leaves user chosen stats
function handleCustomStat(cellHeader, wdlWrapper, ptnmlWrapper) {
    var ptnmlElement = cellHeader.querySelector(".ccc-ptnml");
    var eloElement = cellHeader.querySelector(".ccc-wdl-container");
    var statWrappers = cellHeader.querySelectorAll(".ccc-stat-wrapper");
    if (userCustomOptions.elo && !eloElement) {
        cellHeader.append(wdlWrapper);
    }
    else if (!userCustomOptions.elo && eloElement) {
        statWrappers.forEach(function (wrapper) {
            if (wrapper.contains(eloElement)) {
                cellHeader.removeChild(wrapper);
            }
        });
    }
    if (userCustomOptions.ptnml && !ptnmlElement) {
        cellHeader.append(ptnmlWrapper);
    }
    else if (!userCustomOptions.ptnml && ptnmlElement) {
        statWrappers.forEach(function (wrapper) {
            if (wrapper.contains(ptnmlElement)) {
                cellHeader.removeChild(wrapper);
            }
        });
    }
}
// handles creation of customization inputs
function createOptionInputs() {
    var crossTableModal = document.querySelector(".modal-vue-modal-content");
    if (!crossTableModal) {
        return;
    }
    var width = crossTableModal.getBoundingClientRect().width;
    if (width < 220)
        return;
    var wrapper = document.createElement("div");
    wrapper.classList.add("ccc-options-wrapper");
    var formElement = createRowsForm();
    // * create switches
    var eloLabel = createSwitchLabel("WDL + Elo", "elo");
    var ptnmlLabel = createSwitchLabel("Ptnml", "ptnml");
    wrapper.append(formElement, eloLabel, ptnmlLabel);
    eloLabel.addEventListener("change", function () {
        userCustomOptions.elo = !userCustomOptions.elo;
        chrome.storage.local
            .set({ elo: userCustomOptions.elo })
            .then(convertCrossTable);
    });
    ptnmlLabel.addEventListener("change", function () {
        userCustomOptions.ptnml = !userCustomOptions.ptnml;
        chrome.storage.local
            .set({ ptnml: userCustomOptions.ptnml })
            .then(convertCrossTable);
    });
    crossTableModal.append(wrapper);
}
function createPTNMLStatHeader(ptnml) {
    var ptnmlWrapper = createStatWrapperElement();
    ptnmlWrapper.classList.add("ccc-ptnml-wrapper");
    var ptnmlElement = document.createElement("div");
    var ptnmlHeader = document.createElement("div");
    ptnmlHeader.id = "ptnml-header";
    ptnmlHeader.textContent = "Ptnml(0-2)";
    ptnmlElement.textContent = "".concat(ptnml[0], ", ").concat(ptnml[1], ", ").concat(ptnml[2], ", ").concat(ptnml[3], ", ").concat(ptnml[4]);
    ptnmlElement.classList.add("ccc-ptnml");
    ptnmlWrapper.append(ptnmlHeader, ptnmlElement);
    return ptnmlWrapper;
}
function createWDLStatHeader(wdlArray) {
    var wdlWrapper = createStatWrapperElement();
    wdlWrapper.classList.add("ccc-wdl-wrapper");
    var wdlElement = createWLDEloElement(wdlArray);
    wdlWrapper.append(wdlElement);
    return wdlWrapper;
}
function createRowsForm() {
    var formElement = document.createElement("form");
    var rowAmountInput = document.createElement("input");
    formElement.classList.add("ccc-form");
    rowAmountInput.classList.add("ccc-row-input");
    formElement.textContent = "Pairs per row";
    rowAmountInput.type = "number";
    rowAmountInput.min = "0";
    rowAmountInput.value = "".concat(userCustomOptions.pairPerRow);
    formElement.append(rowAmountInput);
    formElement.addEventListener("submit", function (e) {
        e.preventDefault();
        var value = rowAmountInput.valueAsNumber;
        chrome.storage.local.set({ pairPerRow: value || "" });
        document.body.style.setProperty("--custom-column-amount", "".concat(value ? value * 2 : ""));
    });
    return formElement;
}
function createSwitchLabel(text, field) {
    var _a;
    var label = document.createElement("label");
    var switchInput = document.createElement("input");
    label.classList.add("ccc-label");
    label.textContent = "".concat(text, ":");
    switchInput.classList.add("ccc-input");
    switchInput.type = "checkbox";
    switchInput.checked = (_a = userCustomOptions[field]) !== null && _a !== void 0 ? _a : true;
    label.append(switchInput);
    return label;
}
function addClassNamesCrossTable(crossTableCell) {
    crossTableCell.classList.add("ccc-cell-grid");
    if (enginesAmount === 2) {
        crossTableCell.classList.add("one-v-one");
    }
    else if (enginesAmount > 8) {
        crossTableCell.classList.add("many");
    }
}
function calculateScores(crossTableCell) {
    var gameResultsDivs = crossTableCell.querySelectorAll(".crosstable-result");
    var scoresArray = [];
    var lastResult = undefined;
    gameResultsDivs.forEach(function (result, index) {
        // ID needed to overwrite default CCC styles
        if (result) {
            result.id = "ccc-result";
        }
        if (index % 2 === 0) {
            result.classList.add("ccc-border-left");
            lastResult = getResultFromNode(result);
            scoresArray.push(lastResult);
        }
        else {
            result.classList.add("ccc-border-right");
            var currentResult = getResultFromNode(result);
            var pairResult = getClassNameForPair(lastResult, currentResult);
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
function keydownHandler(e) {
    if (e.code !== "Escape")
        return;
    handleCloseModalOnKeydown();
}
function handleCloseModalOnKeydown() {
    var crossTableModal = document.querySelector(".modal-vue-modal-content");
    var tournamentsList = document.querySelector(".bottomtable-resultspopup");
    var engineDetailsPanel = document.querySelector(".enginedetails-panel");
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
    if (engineDetailsPanel) {
        var closeBtn = document.querySelector("#enginedetails-close");
        closeBtn === null || closeBtn === void 0 ? void 0 : closeBtn.click();
        return;
    }
}
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
    try {
        var crossTableModal_1 = document.querySelector(".modal-vue-modal-content");
        // if (!crossTableModal) return;
        crossTableElements = crossTableModal_1.querySelectorAll(".crosstable-results-cell");
        convertCrossTable();
    }
    catch (e) {
        console.log(e.message);
    }
}
// * elo calculation
// these formulas are taken from https://3dkingdoms.com/chess/elo.htm
// and I have no idea how they work
function calculateEloFromPercent(percent) {
    var percentage = percent / 100;
    var eloDiff = (-400 * Math.log(1 / percentage - 1)) / Math.LN10;
    var Sign = "";
    if (eloDiff > 0) {
        Sign = "+";
    }
    var eloDiffAsString = formatter.format(eloDiff);
    return "".concat(Sign).concat(eloDiffAsString);
}
function calculateEloDifference(percentage) {
    return (-400 * Math.log(1 / percentage - 1)) / Math.LN10;
}
function CalculateInverseErrorFunction(x) {
    var pi = Math.PI;
    var a = (8 * (pi - 3)) / (3 * pi * (4 - pi));
    var y = Math.log(1 - x * x);
    var z = 2 / (pi * a) + y / 2;
    var ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);
    if (x < 0)
        return -ret;
    return ret;
}
function phiInv(p) {
    return Math.sqrt(2) * CalculateInverseErrorFunction(2 * p - 1);
}
function calculateErrorMargin(wins, draws, losses) {
    var total = wins + draws + losses;
    var winP = wins / total;
    var drawP = draws / total;
    var lossP = losses / total;
    var percentage = (wins + draws * 0.5) / total;
    var winsDev = winP * Math.pow(1 - percentage, 2);
    var drawsDev = drawP * Math.pow(0.5 - percentage, 2);
    var lossesDev = lossP * Math.pow(0 - percentage, 2);
    var stdDeviation = Math.sqrt(winsDev + drawsDev + lossesDev) / Math.sqrt(total);
    var confidenceP = 0.95;
    var minConfidenceP = (1 - confidenceP) / 2;
    var maxConfidenceP = 1 - minConfidenceP;
    var devMin = percentage + phiInv(minConfidenceP) * stdDeviation;
    var devMax = percentage + phiInv(maxConfidenceP) * stdDeviation;
    var difference = calculateEloDifference(devMax) - calculateEloDifference(devMin);
    var errorMargin = formatter.format(difference / 2);
    return "\u00B1".concat(errorMargin);
}
