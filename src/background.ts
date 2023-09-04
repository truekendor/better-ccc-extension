/// <reference types="./" />
/// <reference path="./index.d.ts" />

// @ts-ignore
const browserPrefix: Browsers = chrome?.storage ? chrome : browser;

let allowFetching = true;
const eventList: EventItem[] = [];

getEventList();
function getEventList() {
  try {
    return fetch("https://cccc.chess.com/event-list")
      .then((res) => {
        return res.json();
      })
      .then((res: EventItem[]) => {
        eventList.length = 0;
        eventList.push(...res);
      })
      .catch((e: any) => console.log(e?.message));
  } catch (e: any) {
    console.log(e?.message);
  }
}

chrome.runtime.onMessage.addListener(function (
  message: RuntimeMessage,
  sender,
  senderResponse
) {
  try {
    if (eventList.length === 0) {
      return true;
    }
    const { type, payload } = message;

    if (type === "game") {
      if (!payload?.gameNumber || payload.gameNumber % 2 === 1) return true;

      fetch(getGameUrl(eventList[0].id, payload.gameNumber))
        .then((res) => {
          return res.json();
        })
        .then((res: ChessComGameResponse) => {
          const pgn = getMovesFromPgn(res.pgn);
          const movesArray: string[] = pgn
            .split(" ")
            .filter((el) => el !== "" && el !== " ");

          if (!movesArray.length) return true;

          senderResponse(movesArray ?? null);
        });
    } else if (type === "load") {
      onLoadHandler();
    }

    return true;
  } catch (e: any) {
    console.log(e?.message);
  }
});

// to request agreement from random CCC games
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  try {
    if (!changeInfo.url) return;

    const info = getEventAndGame(tab);
    if (!info) return;

    const { event, game } = info;

    if (!event || !game || game % 2 === 1) return;

    fetch(getGameUrl(event, game - 1))
      .then((res) => {
        return res.json();
      })
      .then((res: ChessComGameResponse) => {
        let pgn = getMovesFromPgn(res.pgn);

        return pgn.split(" ").filter((el) => el !== "" && el !== " ");
      })
      .then((pgn) => {
        const data: RuntimeMessage = {
          type: "pgn",
          payload: {
            pgn,
          },
        };

        chrome.tabs.query(
          { active: true, currentWindow: true },

          function (tabs) {
            if (!tabs[0].id) return;
            chrome.tabs.sendMessage(tabs[0].id, data);
          }
        );
      })
      .catch((err) => console.log("Error at bg: ", err.message));

    // return true;
  } catch (e: any) {
    console.log(e?.message);
  }
});

// @ts-ignore
async function getCurrentTab() {
  try {
    const queryOptions = { active: true, currentWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);

    return tab;
  } catch (e: any) {
    console.log(e?.message);
  }
}

// @ts-ignore
async function onLoadHandler() {
  try {
    const tab = await getCurrentTab();
    if (!tab) return;

    const info = getEventAndGame(tab);
    if (!info) return;

    const { event, game } = info;

    if (!event || !game || game % 2 === 1) return;

    const gameLogsRaw = await fetch(getGameUrl(event, game - 1));
    const gameLogs = await gameLogsRaw.json();

    let pgnRaw: string = getMovesFromPgn(gameLogs.pgn);
    const pgn: string[] = pgnRaw
      .split(" ")
      .filter((el) => el !== "" && el !== " ");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0].id) return;
      const message: RuntimeMessage = {
        type: "pgn",
        payload: {
          pgn,
        },
      };

      chrome.tabs.sendMessage(tabs[0].id, message);
    });
  } catch (e: any) {
    console.log(e?.message);
  }
}

function getEventAndGame(tab: Tab): EventAndGame | null {
  const url = tab?.url;
  // get # query
  // @ts-ignore
  if (!url || !url.includes("computer-chess-championship")) {
    console.log("not CCC");
    return null;
  }
  const textAfterHash = url?.split("#")?.[1];

  if (!textAfterHash) return null;

  const allHashQueries = textAfterHash?.split("&");
  const queries = allHashQueries.map((query) => {
    return query.split("=");
  });

  let game;
  let event;

  queries.forEach((el) => {
    if (el[0] === "event") {
      event = el[1];
      return;
    }
    if (el[0] === "game") {
      game = parseInt(el[1]);
    }
  });

  if (!event || !game) return null;

  return { event, game };
}

function getGameUrl(eventId: string, gameNumber: number): string {
  return `https://cccc.chess.com/archive?event=${eventId}&game=${gameNumber}`;
}

/**
 * @returns Moves string in a format like this:
 *  "1. e4 e5 2. Nf3 Nf6 3. ... ..."
 */
function getMovesFromPgn(pgn: string): string {
  const data: string[] = pgn.split("\n");
  const pgnString = data[data.length - 1];

  return pgnString;
}

// @ts-ignore
// chrome.runtime.onInstalled.addListener(async () => {
//
// });
