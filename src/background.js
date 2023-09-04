/// <reference types="./" />
/// <reference path="./index.d.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// @ts-ignore
var browserPrefix = (chrome === null || chrome === void 0 ? void 0 : chrome.storage) ? chrome : browser;
var allowFetching = true;
var eventList = [];
getEventList();
function getEventList() {
    try {
        return fetch("https://cccc.chess.com/event-list")
            .then(function (res) {
            return res.json();
        })
            .then(function (res) {
            eventList.length = 0;
            eventList.push.apply(eventList, res);
        })
            .catch(function (e) { return console.log(e === null || e === void 0 ? void 0 : e.message); });
    }
    catch (e) {
        console.log(e === null || e === void 0 ? void 0 : e.message);
    }
}
chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {
    try {
        if (eventList.length === 0) {
            return true;
        }
        var type = message.type, payload = message.payload;
        if (type === "game") {
            if (!(payload === null || payload === void 0 ? void 0 : payload.gameNumber) || payload.gameNumber % 2 === 1)
                return true;
            fetch(getGameUrl(eventList[0].id, payload.gameNumber))
                .then(function (res) {
                return res.json();
            })
                .then(function (res) {
                var pgn = getMovesFromPgn(res.pgn);
                var movesArray = pgn
                    .split(" ")
                    .filter(function (el) { return el !== "" && el !== " "; });
                if (!movesArray.length)
                    return true;
                senderResponse(movesArray !== null && movesArray !== void 0 ? movesArray : null);
            });
        }
        else if (type === "load") {
            onLoadHandler();
        }
        return true;
    }
    catch (e) {
        console.log(e === null || e === void 0 ? void 0 : e.message);
    }
});
// to request agreement from random CCC games
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    try {
        if (!changeInfo.url)
            return;
        var info = getEventAndGame(tab);
        if (!info)
            return;
        var event_1 = info.event, game = info.game;
        if (!event_1 || !game || game % 2 === 1)
            return;
        fetch(getGameUrl(event_1, game - 1))
            .then(function (res) {
            return res.json();
        })
            .then(function (res) {
            var pgn = getMovesFromPgn(res.pgn);
            return pgn.split(" ").filter(function (el) { return el !== "" && el !== " "; });
        })
            .then(function (pgn) {
            var data = {
                type: "pgn",
                payload: {
                    pgn: pgn,
                },
            };
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (!tabs[0].id)
                    return;
                chrome.tabs.sendMessage(tabs[0].id, data);
            });
        })
            .catch(function (err) { return console.log("Error at bg: ", err.message); });
        // return true;
    }
    catch (e) {
        console.log(e === null || e === void 0 ? void 0 : e.message);
    }
});
// @ts-ignore
function getCurrentTab() {
    return __awaiter(this, void 0, void 0, function () {
        var queryOptions, tab, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    queryOptions = { active: true, currentWindow: true };
                    return [4 /*yield*/, chrome.tabs.query(queryOptions)];
                case 1:
                    tab = (_a.sent())[0];
                    return [2 /*return*/, tab];
                case 2:
                    e_1 = _a.sent();
                    console.log(e_1 === null || e_1 === void 0 ? void 0 : e_1.message);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// @ts-ignore
function onLoadHandler() {
    return __awaiter(this, void 0, void 0, function () {
        var tab, info, event_2, game, gameLogsRaw, gameLogs, pgnRaw, pgn_1, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, getCurrentTab()];
                case 1:
                    tab = _a.sent();
                    if (!tab)
                        return [2 /*return*/];
                    info = getEventAndGame(tab);
                    if (!info)
                        return [2 /*return*/];
                    event_2 = info.event, game = info.game;
                    if (!event_2 || !game || game % 2 === 1)
                        return [2 /*return*/];
                    return [4 /*yield*/, fetch(getGameUrl(event_2, game - 1))];
                case 2:
                    gameLogsRaw = _a.sent();
                    return [4 /*yield*/, gameLogsRaw.json()];
                case 3:
                    gameLogs = _a.sent();
                    pgnRaw = getMovesFromPgn(gameLogs.pgn);
                    pgn_1 = pgnRaw
                        .split(" ")
                        .filter(function (el) { return el !== "" && el !== " "; });
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        if (!tabs[0].id)
                            return;
                        var message = {
                            type: "pgn",
                            payload: {
                                pgn: pgn_1,
                            },
                        };
                        chrome.tabs.sendMessage(tabs[0].id, message);
                    });
                    return [3 /*break*/, 5];
                case 4:
                    e_2 = _a.sent();
                    console.log(e_2 === null || e_2 === void 0 ? void 0 : e_2.message);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getEventAndGame(tab) {
    var _a;
    var url = tab === null || tab === void 0 ? void 0 : tab.url;
    // get # query
    // @ts-ignore
    if (!url || !url.includes("computer-chess-championship")) {
        console.log("not CCC");
        return null;
    }
    var textAfterHash = (_a = url === null || url === void 0 ? void 0 : url.split("#")) === null || _a === void 0 ? void 0 : _a[1];
    if (!textAfterHash)
        return null;
    var allHashQueries = textAfterHash === null || textAfterHash === void 0 ? void 0 : textAfterHash.split("&");
    var queries = allHashQueries.map(function (query) {
        return query.split("=");
    });
    var game;
    var event;
    queries.forEach(function (el) {
        if (el[0] === "event") {
            event = el[1];
            return;
        }
        if (el[0] === "game") {
            game = parseInt(el[1]);
        }
    });
    if (!event || !game)
        return null;
    return { event: event, game: game };
}
function getGameUrl(eventId, gameNumber) {
    return "https://cccc.chess.com/archive?event=".concat(eventId, "&game=").concat(gameNumber);
}
/**
 * @returns Moves string in a format like this:
 *  "1. e4 e5 2. Nf3 Nf6 3. ... ..."
 */
function getMovesFromPgn(pgn) {
    var data = pgn.split("\n");
    var pgnString = data[data.length - 1];
    return pgnString;
}
// @ts-ignore
// chrome.runtime.onInstalled.addListener(async () => {
//
// });
