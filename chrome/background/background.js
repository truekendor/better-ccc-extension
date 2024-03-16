"use strict";
/// <reference types="../types" />
/// <reference path="../types/index.d.ts" />
/// <reference path="../types/lila-tb.ts" />
/// <reference path="../types/chess-com.d.ts" />
/// <reference path="../types/chess-js.ts" />
// todo fix this
const _bg_browserPrefix = chrome?.storage ? chrome : browser;
_bg_browserPrefix.runtime.onMessage.addListener(function (message
// sender,
// senderResponse
) {
    try {
        const { type, payload } = message;
        if (type === "remove_query") {
            _bg_browserPrefix.tabs.query({ currentWindow: true, active: true });
            getCurrentTab().then((tab) => {
                if (!tab || !tab.id || !tab.url)
                    return;
                const { event, game } = URLHelper.getEventAndGame(tab);
                if (event && !game) {
                    const replaceUrl = tab.url.replace(`event=${event}`, "");
                    // @ts-ignore
                    _bg_browserPrefix.tabs.update(tab.id, { url: replaceUrl });
                }
            });
        }
        if (type === "onload") {
            if (!payload.doRequest) {
                return;
            }
            onLoadHandler();
        }
        else if (type === "reverse_pgn_request") {
            const { gameNumber, event } = payload;
            _bg_requestReverseGame(gameNumber, event).catch((e) => {
                console.log("Game fetch error: ", e?.message ?? e);
            });
        }
        else if (type === "request_tb_eval") {
            // const { fen, currentPly } = payload;
            // requestTBScoreHandler(fen, currentPly)
            //   .then((res) => {
            //     senderResponse(res);
            //   })
            //   .catch((e) => console.log("TB fetch error: ", e?.message ?? e));
        }
        return false;
    }
    catch (e) {
        console.log(e?.message ?? e);
    }
});
_bg_browserPrefix.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    try {
        if (!changeInfo.url) {
            return false;
        }
        if (!changeInfo.url.includes("chess.com/computer-chess-championship") &&
            !changeInfo.url.includes("chess.com/ccc")) {
            return;
        }
        const { event, game } = URLHelper.getEventAndGame(tab);
        const message = {
            type: "tab_update",
            payload: {
                event,
                game,
            },
        };
        _sendMessageToContent(message);
        if (!game || !event)
            return;
        return false;
    }
    catch (e) {
        console.log("tab updated error", e);
    }
});
async function getCurrentTab() {
    try {
        const chromeTab = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        if (chromeTab?.[0]) {
            return chromeTab[0];
        }
        const firefoxTab = await browser.tabs.query({
            active: true,
            currentWindow: true,
        });
        return firefoxTab[0];
    }
    catch (e) {
        console.log(e?.message ?? e);
    }
}
async function onLoadHandler() {
    try {
        const tab = await getCurrentTab();
        if (!tab || !tab.id) {
            return false;
        }
        const { event, game } = URLHelper.getEventAndGame(tab);
        const message = {
            type: "tab_update",
            payload: {
                event,
                game,
            },
        };
        _sendMessageToContent(message);
        if (game && event) {
            const reverseGameNumber = game % 2 === 1 ? game + 1 : game - 1;
            const urlToFetch = URLHelper.getArchiveGameURL(event, reverseGameNumber);
            const data = await fetch(urlToFetch);
            const response = (await data.json());
            if (!response) {
                console.log("game request error:: game not found");
                return false;
            }
            const message = {
                type: "reverse_pgn_response",
                payload: {
                    pgn: getMovesFromPgn(response.pgn),
                    reverseGameNumber,
                    gameNumber: game,
                    eventId: event,
                },
            };
            _sendMessageToContent(message);
        }
        return false;
    }
    catch (e) {
        console.log(e?.message);
    }
}
async function _bg_requestReverseGame(gameNumber, event) {
    const reverseGameNumber = gameNumber % 2 === 0 ? gameNumber - 1 : gameNumber + 1;
    const response = await fetch(URLHelper.getArchiveGameURL(event, reverseGameNumber));
    if (!response.ok)
        throw new Error("No response");
    const result = (await response.json());
    if (!result)
        throw new Error("Result is null");
    if (!result.pgn)
        throw new Error("No pgn");
    const pgnArray = getMovesFromPgn(result.pgn);
    const message = {
        type: "reverse_pgn_response",
        payload: {
            gameNumber,
            reverseGameNumber,
            pgn: pgnArray,
            eventId: event,
        },
    };
    _sendMessageToContent(message);
}
// async function requestTBScoreHandler(fen: string, ply: number): {
//   // const tbResponse = await tbScore.requestTBScoreStandard(fen);
//   // const message: message_pass.message = {
//   //   type: "response_tb_standard",
//   //   payload: {
//   //     response: tbResponse || null,
//   //     ply,
//   //   },
//   // };
//   // return message;
// }
/**
 * returns moves string that looks like this
 * ```
 * "1. e4 e5 2. Nf3 Nc6 3. Nf6 ..."
 * ```
 */
function getMovesFromPgn(pgn) {
    const data = pgn.split("\n");
    const pgnString = data[data.length - 1];
    return parsePGNMoves(pgnString);
}
/**
 * returns string[] with moves in SAN format
 * ```
 * ['e4', 'e5', 'Ke2', 'Ke7', 'Na3', ...]
 * ```
 */
function parsePGNMoves(pgn) {
    return (pgn
        .split(" ")
        // removes whitespaces
        .filter((el) => el !== "" && el !== " ")
        // filter potential comments
        .filter((el) => !el.includes("{") && !el.includes("[") && !el.includes("*"))
        // filter move numbers and game result
        .filter((val) => {
        if (!val.match(/^\d/gi))
            return val;
    }));
}
// todo add description
class URLHelper {
    static getEventAndGame(tab) {
        const url = tab?.url;
        // get "#" query params
        const textAfterHash = url?.split("#")?.[1];
        const eventAndGame = {
            event: null,
            game: null,
        };
        if (!url ||
            !url.includes("computer-chess-championship") ||
            !textAfterHash) {
            return eventAndGame;
        }
        const allHashQueries = textAfterHash?.split("&");
        const queries = allHashQueries.map((query) => {
            return query.split("=");
        });
        try {
            queries.forEach((el) => {
                if (el[0] === "event") {
                    if (!el[1])
                        throw new Error("Event name is empty");
                    eventAndGame.event = el[1];
                    return;
                }
                if (el[0] === "game") {
                    if (!el[1])
                        throw new Error("Game number is empty");
                    eventAndGame.game = parseInt(el[1]);
                }
            });
        }
        catch (e) {
            console.log(e?.message ?? e);
        }
        return eventAndGame;
    }
    static getArchiveGameURL(eventId, gameNumber) {
        return `https://cccc.chess.com/archive?event=${eventId}&game=${gameNumber}`;
    }
}
// todo add description
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TB7Score {
    constructor() {
        this.controller = new AbortController();
        // todo move to the URLHelper ?
        this.urlBase = "https://tablebase.lichess.ovh/standard";
        this.urlStandard = `${this.urlBase}?fen=`;
        this.urlMainline = `${this.urlBase}/mainline?fen=`;
    }
    async requestTBScoreStandard(fen) {
        try {
            const requestURL = `${this.urlStandard}${fen}`;
            const response = await fetch(requestURL, {
                signal: this.controller.signal,
            });
            const result = await response.json();
            return result;
        }
        catch (e) {
            console.log("failed to request standard tb score: ", e?.message ?? e);
        }
    }
    async requestTBScoreMainline(fen) {
        try {
            const requestURL = `${this.urlMainline}${fen}`;
            const response = await fetch(requestURL, {
                signal: this.controller.signal,
            });
            const result = await response.json();
            return result;
        }
        catch (e) {
            console.log(e?.message ?? e);
        }
    }
}
/**
 * sends a message to the content scripts
 */
async function _sendMessageToContent(message) {
    try {
        const tab = await getCurrentTab();
        if (!tab || !tab.id)
            return false;
        _bg_browserPrefix.tabs.sendMessage(tab.id, message);
        return false;
    }
    catch (e) {
        console.log("background::sendMessageToContent error: ", e);
    }
}
