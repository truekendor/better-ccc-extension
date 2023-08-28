let allowFetching = true;
const eventList = [];

getEventList();
function getEventList() {
  try {
    return fetch("https://cccc.chess.com/event-list")
      .then((res) => {
        return res.json();
      })
      .then((res) => {
        eventList.length = 0;
        eventList.push(...res);
      })
      .catch((e) => console.log(e.message));
  } catch (e) {
    console.log(e?.message);
  }
}

chrome.runtime.onMessage.addListener(function (
  message,
  sender,
  senderResponse
) {
  try {
    if (eventList.length === 0) {
      console.log("no event list!");

      return true;
    }
    const { type, payload } = message;

    // if (payload.gameNumber % 2 === 1) return true;

    if (type === "game") {
      fetch(getGameUrl(eventList[0]?.id, payload.gameNumber))
        .then((res) => {
          return res.json();
        })
        .then((res) => {
          let pgn = getMovesFromPgn(res.pgn);
          pgn = pgn.split(" ").filter((el) => el !== "" && el !== " ");

          if (!pgn) return true;

          senderResponse(pgn ?? null);
        });
    }
    if (type === "load") {
      onLoadHandler();
    }

    return true;
  } catch (e) {
    console.log(e?.message);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  //
});

// to request agreement from random CCC games
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  try {
    if (!changeInfo.url) return;

    let { event, game } = getEventAndGame(tab) ?? { event: "", game: "" };
    if (!event || !game || parseInt(game) % 2 === 1) return;

    fetch(getGameUrl(event, game - 1))
      .then((res) => {
        return res.json();
      })
      .then((res) => {
        let pgn = getMovesFromPgn(res.pgn);
        pgn = pgn.split(" ").filter((el) => el !== "" && el !== " ");
        return pgn;
      })
      .then((pgn) => {
        chrome.tabs.query(
          { active: true, currentWindow: true },

          function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "pgn",
              payload: {
                pgn,
              },
            });
          }
        );
      })
      .catch((err) => console.log("Error at bg: ", err.message));

    // return true;
  } catch (e) {
    console.log(e?.message);
  }
});

async function getCurrentTab() {
  try {
    const queryOptions = { active: true, currentWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);

    return tab;
  } catch (e) {
    console.log(e?.message);
  }
}

async function onLoadHandler() {
  try {
    const tab = await getCurrentTab();

    let { event, game } = getEventAndGame(tab) ?? { event: "", game: "" };
    console.log("game", game);
    if (!event || !game || parseInt(game) % 2 === 1) return;

    const gameLogsRaw = await fetch(getGameUrl(event, game - 1));
    const gameLogs = await gameLogsRaw.json();

    let pgn = getMovesFromPgn(gameLogs.pgn);
    pgn = pgn.split(" ").filter((el) => el !== "" && el !== " ");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      console.log("PGN TO SEND ", pgn);

      chrome.tabs.sendMessage(tabs[0].id, {
        type: "pgn",
        payload: {
          pgn,
        },
      });
    });
  } catch (e) {
    console.log(e?.message);
  }
}

function getEventAndGame(tab) {
  let url = tab?.url;
  // get # query
  if (!url.match("computer-chess-championship")) {
    console.log("not CCC");
    return;
  }
  url = url?.split("#")?.[1];
  if (!url) {
    // current game
    return;
  }
  url = url?.split("&");
  url = url.map((query) => {
    return query.split("=");
  });
  let game;
  let event;
  url.forEach((el) => {
    if (el[0] === "event") {
      event = el[1];
      return;
    }
    if (el[0] === "game") {
      game = el[1];
    }
  });
  console.log(`event, ${event}`, `game, ${game}`);

  return { event, game };
}

function getGameUrl(eventId, gameNumber) {
  return `https://cccc.chess.com/archive?event=${eventId}&game=${gameNumber}`;
}

function getMovesFromPgn(pgn) {
  const data = pgn.split("\n");
  return data[data.length - 1];
}
