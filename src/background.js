let allowFetching = true;
const eventList = [];

getEventList();
function getEventList() {
  return fetch("https://cccc.chess.com/event-list")
    .then((res) => {
      return res.json();
    })
    .then((res) => {
      eventList.length = 0;
      eventList.push(...res);
    })
    .catch((e) => console.log(e.message));
}

chrome.runtime.onMessage.addListener(function (
  message,
  sender,
  senderResponse
) {
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
      })
      .catch((err) => console.log("Error at bg: ", err.message));
  }

  return true;
});

// to request agreement from random CCC games
chrome.runtime.onInstalled.addListener(async () => {
  // try {
  //   setInterval(async () => {
  //     const tab = await getCurrentTab();
  //     const url = tab?.url;
  //     // get # query
  //     let uuu = url?.split("#")?.[1];
  //     if (!uuu) {
  //       // current game
  //       return;
  //     }
  //     uuu = uuu?.split("&");
  //     uuu = uuu.map((query) => {
  //       return query.split("=");
  //     });
  //     let game;
  //     let event;
  //     uuu.forEach((el) => {
  //       if (el[0] === "event") {
  //         event = el[1];
  //         return;
  //       }
  //       if (el[0] === "game") {
  //         game = el[1];
  //       }
  //     });
  //     console.log(`event, ${event}`, `game, ${game}`);
  //   }, 1100);
  // } catch (e) {
  //   console.log(e.message);
  // }
});

async function getCurrentTab() {
  const queryOptions = { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

function getGameUrl(eventId, gameNumber) {
  return `https://cccc.chess.com/archive?event=${eventId}&game=${gameNumber}`;
}

function getMovesFromPgn(pgn) {
  const data = pgn.split("\n");
  return data[data.length - 1];
}
