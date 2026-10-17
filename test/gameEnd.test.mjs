/**
 * Live game end detection (src/gameEnd/*, src/gameResultToast.ts).
 *
 * Runs on the compiled scripts: `npm test` (= tsc && node --test test/).
 * GAMEEND_DEBUG=1 prints the detectors' debug log.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import {
  LiveGame,
  SCRIPTS,
  SRC_DIR,
  createWorld,
  loadLogic,
  parseMonitor,
  plain,
  playArchivedGame,
  readFixture,
  replayMonitor,
  scheduleRow,
} from "./harness.mjs";

const { GameEndRules: R, GameEndArbiter: A, GameEndConfig: C, EvalConvention: E } = loadLogic();

const GAMES = Object.fromEntries(
  JSON.parse(readFixture("ccc-games.json")).map((game) => [game.termination, game])
);
const THREEFOLD_GAME = GAMES["Draw by 3-fold repetition"];
const MATE_GAME = GAMES["White mates"];
const ADJUDICATED_GAME = GAMES["Draw by adjudication"];
const TABLEBASE_GAME = GAMES["Draw by adjudication: SyzygyTB"];

const RUY = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O".split(" ");
const RUY_MORE = "h3 Nb8 d4 Nbd7 Nbd2 Bb7 Bc2 Re8 Nf1 Bf8".split(" ");
const NEXT_BOOK = "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3".split(" ");
const LEGALL = "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#".split(" ");
const LOYD_STALEMATE =
  "e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6".split(" ");

const candidate = (outcome, confidence, source = "board") => ({
  outcome,
  confidence,
  source,
  reason: "",
});

/** eval draw counter over archived plies ([san, score, secs, left], book: score null) */
function evalDrawFiresAt(plies) {
  let count = 0;
  for (let i = 0; i < plies.length; i++) {
    const [san, score] = plies[i];
    count = R.nextEvalDrawCount(count, { san, score: score === null ? null : R.parseEval(score).pawns });
    if (R.isEvalDrawReached(count, i + 1)) return i + 1;
  }
  return null;
}

// * =========================
// * pure functions

describe("GameEndRules: evals and engine stats", () => {
  test("parseEval reads normal and mate scores", () => {
    assert.deepEqual(plain(R.parseEval("+M13")), { pawns: 1000, mateIn: 13 });
    assert.deepEqual(plain(R.parseEval("-M5")), { pawns: -1000, mateIn: -5 });
    assert.deepEqual(plain(R.parseEval("M8")), { pawns: 1000, mateIn: 8 });
    assert.deepEqual(plain(R.parseEval("#-3")), { pawns: -1000, mateIn: -3 });
    assert.deepEqual(plain(R.parseEval("+ 82.50")), { pawns: 82.5, mateIn: null });
    assert.deepEqual(plain(R.parseEval("+0.77")), { pawns: 0.77, mateIn: null });
    assert.deepEqual(plain(R.parseEval("200.00")), { pawns: 200, mateIn: null });
    assert.deepEqual(plain(R.parseEval("−1.25")), { pawns: -1.25, mateIn: null });

    const negativeZero = R.parseEval("-0.00");
    assert.equal(negativeZero.mateIn, null);
    assert.ok(Object.is(negativeZero.pawns, -0));
  });

  test("parseEval rejects clocks, fifty-move counters and empty text", () => {
    for (const text of ["3:02", "0:02.11", "13/50", "", null, undefined, "Torch", "+"]) {
      assert.equal(R.parseEval(text), null, `${text}`);
    }
  });

  test("evals are white-relative (the server negates Black's score)", () => {
    assert.equal(E.POINT_OF_VIEW, "white");
    assert.equal(E.toWhitePov("black", R.parseEval("-1.50")), -1.5);
  });

  test("valueBoxSignature: Depth, Nodes, Speed, TB Hits (not Time, the clock, nor the rebuilt Eval)", () => {
    const spans = ["+0.61", "24", "90.88M", "2:30", "188.93M", "4"];
    assert.equal(R.valueBoxSignature(spans), "24|90.88M|188.93M|4");
    // the clock after a move, the eval rebuilt from the PGN at the end
    assert.equal(R.valueBoxSignature([...spans.slice(0, 3), "2:32", ...spans.slice(4)]), R.valueBoxSignature(spans));
    assert.equal(R.valueBoxSignature(["-0.00", ...spans.slice(1)]), R.valueBoxSignature(spans));
    // a search line
    assert.notEqual(R.valueBoxSignature(["+0.61", "24", "91.20M", "2:30", "188.93M", "4"]), R.valueBoxSignature(spans));
    assert.equal(R.valueBoxSignature(["", "", "", "", "", ""]), "|||");
  });
});

describe("GameEndRules: CCC rules", () => {
  test("captures and pawn moves restart the 50-move counter", () => {
    for (const san of ["exd5", "Nxe4", "e4", "e8=Q+", "bxa8=N", "Qxf7#"]) {
      assert.equal(R.isCaptureOrPawnMove(san), true, san);
    }
    for (const san of ["Nf3", "O-O", "O-O-O", "Kb1", "Rg6+", "Qa8"]) {
      assert.equal(R.isCaptureOrPawnMove(san), false, san);
    }
  });

  test("eval draw: ±0.10 for 20 plies from fullmove 50, captures and pawn moves restart at 1", () => {
    const next = (count, san, score) => R.nextEvalDrawCount(count, { san, score });

    assert.equal(next(5, "Qb3", 0.01), 6);
    assert.equal(next(5, "Qb3", -0.1), 6);
    assert.equal(next(5, "Qb3", 0.11), 0);
    assert.equal(next(5, "Qb3", 1000), 0);
    assert.equal(next(5, "Nxa3", 0.04), 1);
    assert.equal(next(5, "Nxa3", 0.12), 0);
    assert.equal(next(5, "h4", 0), 1);
    // unknown score (book move, instant move without info): start over
    assert.equal(next(5, "Qb3", null), 0);

    assert.equal(R.isEvalDrawReached(20, 100), true);
    assert.equal(R.isEvalDrawReached(20, 99), false);
    assert.equal(R.isEvalDrawReached(19, 140), false);
    assert.equal(R.isEvalDrawReached(35, 133), true);
  });

  test("eval draw: fires at the last ply of the adjudicated archived game, never early in others", () => {
    assert.equal(evalDrawFiresAt(ADJUDICATED_GAME.plies), ADJUDICATED_GAME.plies.length);
    for (const game of [THREEFOLD_GAME, MATE_GAME, TABLEBASE_GAME]) {
      assert.equal(evalDrawFiresAt(game.plies), null, game.termination);
    }
  });

  test("tablebase lookups only for a capture leaving 6 men or less", () => {
    assert.equal(R.isTablebaseCandidate("Nxa5", "8/8/8/Nk6/8/1b4P1/5K1P/8 b - - 0 50"), true);
    assert.equal(R.isTablebaseCandidate("Kb4", "8/8/8/Nk6/8/1b4P1/5K1P/8 b - - 0 50"), false);
    assert.equal(R.isTablebaseCandidate("Nxa5", "8/8/8/Nk6/8/1b4P1/5KPP/8 b - - 0 50"), false);
  });
});

describe("GameEndRules: clocks and game over", () => {
  test("parseClockSeconds reads every clock format, empty is unknown", () => {
    assert.equal(R.parseClockSeconds("3:02"), 182);
    assert.equal(R.parseClockSeconds("0:23"), 23);
    assert.equal(R.parseClockSeconds("0:02.11"), 2.11);
    assert.equal(R.parseClockSeconds("0:00.10"), 0.1);
    assert.equal(R.parseClockSeconds("1:02:03"), 3723);
    assert.equal(R.parseClockSeconds(" 0:06 "), 6);
    assert.equal(R.parseClockSeconds("-0:01.50"), -1.5);
    assert.equal(R.parseClockSeconds(""), null);
    assert.equal(R.parseClockSeconds(null), null);
    assert.equal(R.parseClockSeconds("13/50"), null);
  });

  test("flagTime counts from the move while the display still shows its value", () => {
    assert.equal(R.flagTime(2.11, 10_400, 10_000), 12_110);
    assert.equal(R.flagTime(2.11, 11_200, 10_000), 13_310);
    assert.equal(R.flagTime(30, 5000), 35_000);
  });

  test("isClockStopped: only no drop at all means stopped", () => {
    assert.equal(R.isClockStopped(10, 10), true);
    assert.equal(R.isClockStopped(10, 12), true);
    assert.equal(R.isClockStopped(6, 5.65), false);
    assert.equal(R.isClockStopped(2.11, 0.11), false);
    assert.equal(R.isClockStopped(2.11, null), false);
  });

  test("freezeState: the side to move's box unchanged since the ply", () => {
    const state = (input, ms) =>
      R.freezeState({ now: 0, since: 0, boxKnown: true, changedAt: null, ...input }, ms);

    assert.equal(state({ now: 1499 }), "waiting");
    assert.equal(state({ now: 1500 }), "frozen");
    assert.equal(state({ now: 1999 }, C.FREEZE_HIDDEN_MS), "waiting");
    assert.equal(state({ now: 9000, changedAt: 300 }), "active");
    assert.equal(state({ now: 9000, boxKnown: false }), "unknown");
    assert.equal(state({ now: 9000, since: null }), "unknown");
    assert.equal(state({ now: 5999 }, C.UNEXPLAINED_FREEZE_MS), "waiting");
    assert.equal(state({ now: 6000 }, C.UNEXPLAINED_FREEZE_MS), "frozen");
  });

  test("classifyFlag: searched until the flag, stopped before, wrong clock", () => {
    const flag = (input) =>
      R.classifyFlag({ now: 4000, since: 0, boxKnown: true, changedAt: 2200, flagAt: 2500, ...input });

    // 1.5 s after the clock ran out
    assert.equal(flag({ now: 3999 }), "not-yet");
    assert.equal(flag({}), "time-forfeit");
    assert.equal(flag({ flagAt: null, now: 99_999 }), "not-yet");
    // the engine stopped well before its clock ran out: the game ended otherwise
    assert.equal(flag({ changedAt: 900 }), "not-a-flag");
    assert.equal(flag({ changedAt: null }), "not-a-flag");
    assert.equal(flag({ changedAt: 1300 }), "unclear");
    // still searching well after its flag time: the clock reading was wrong
    assert.equal(flag({ now: 6000, changedAt: 4100 }), "not-yet");
    // stats not shown
    assert.equal(flag({ boxKnown: false }), "unclear");
  });

  test("isEventEndSuspected: a while after the end, or a long pause with idle engines", () => {
    const suspected = (input) =>
      R.isEventEndSuspected({ now: 0, lastMoveAt: 0, endedAt: null, freeze: "frozen", ...input });

    assert.equal(suspected({ now: 44_999 }), false);
    assert.equal(suspected({ now: 45_000 }), true);
    assert.equal(suspected({ now: 45_000, freeze: "unknown" }), true);
    assert.equal(suspected({ now: 99_000, freeze: "active" }), false);
    assert.equal(suspected({ now: 20_999, endedAt: 6000 }), false);
    assert.equal(suspected({ now: 21_000, endedAt: 6000 }), true);
  });
});

describe("GameEndRules: results shown by the page", () => {
  const message = (type, payload, source = "better-ccc-page") =>
    plain(R.parsePageMessage({ source, type, json: JSON.stringify(payload) }));

  test("parsePageMessage validates the messages of inject/index.js", () => {
    assert.deepEqual(
      message("result", {
        whiteName: "Reckless",
        blackName: "Torch",
        score: "1/2-1/2",
        reason: "Draw by adjudication: SyzygyTB",
      }),
      {
        type: "result",
        whiteName: "Reckless",
        blackName: "Torch",
        outcome: "draw",
        reason: "Draw by adjudication: SyzygyTB",
      }
    );
    assert.deepEqual(
      message("gameUpdate", {
        gameNr: 212836,
        live: false,
        termination: "drawSyzygy",
        outcome: "1/2-1/2",
        white: "Reckless",
        black: "Torch",
        plyCount: 157,
      }),
      {
        type: "gameUpdate",
        gameNr: "212836",
        live: false,
        termination: "drawSyzygy",
        outcome: "draw",
        white: "Reckless",
        black: "Torch",
        plyCount: 157,
      }
    );
    assert.equal(message("gameUpdate", { gameNr: "212837", live: true }).outcome, null);

    assert.equal(message("result", { score: "1-0" }, "someone-else"), null);
    assert.equal(message("result", { score: "*" }), null);
    assert.equal(message("gameUpdate", { live: true }), null);
    assert.equal(message("newMove", { move: "e2e4" }), null);
    assert.equal(R.parsePageMessage({ source: "better-ccc-page", type: "result", json: "{oops" }), null);
    assert.equal(R.parsePageMessage("better-ccc-page"), null);
    assert.equal(R.parsePageMessage(null), null);
  });

  test("result reasons and termination codes become toast labels", () => {
    const labels = {
      "White mates": "Checkmate",
      "Black mates": "Checkmate",
      "Draw by adjudication: SyzygyTB": "Tablebase draw",
      "Draw by adjudication": "Adjudication",
      "White wins by adjudication": "Adjudication",
      "Draw by 3-fold repetition": "Repetition",
      "Draw by fifty moves rule": "50-move rule",
      "Draw by stalemate": "Stalemate",
      "Draw by insufficient mating material": "Insufficient material",
      "Black loses on time": "Time forfeit",
      "White disconnects": "Disconnection",
      "White's connection stalls": "Connection stall",
      "Black makes an illegal move": "Illegal move",
      "Something new": "Something new",
    };
    for (const [reason, label] of Object.entries(labels)) {
      const outcome = reason.startsWith("Draw") ? "draw" : "white";
      assert.equal(R.socketReasonLabel(reason, outcome), label, reason);
    }

    assert.equal(R.terminationLabel("drawSyzygy"), "Tablebase draw");
    assert.equal(R.terminationLabel("drawAdj"), "Adjudication");
    assert.equal(R.terminationLabel("whiteMates"), "Checkmate");
    assert.equal(R.terminationLabel("blackTimeout"), "Time forfeit");
    assert.equal(R.terminationLabel("whiteDc"), "Disconnection");
    assert.equal(R.terminationLabel("newCode"), "newCode");

    assert.equal(R.pageResultLabel("Syzygy Adjudication"), "Tablebase draw");
    assert.equal(R.pageResultLabel("50 Moves"), "50-move rule");
    assert.equal(R.pageResultLabel("Checkmate"), "Checkmate");
  });

  test("parsePageResult / outcomeFromPanelClasses", () => {
    assert.deepEqual(
      plain(R.parsePageResult(["movetable-gameResult", "movetable-draw"], "Draw 1/2 - 1/2 Syzygy Adjudication")),
      { outcome: "draw", reason: "Tablebase draw" }
    );
    assert.deepEqual(
      plain(R.parsePageResult(["movetable-gameResult", "movetable-white"], "White Won 1 - 0 Checkmate")),
      { outcome: "white", reason: "Checkmate" }
    );
    assert.equal(R.parsePageResult(["movetable-gameResult"], "Draw 1/2 - 1/2"), null);

    assert.equal(R.outcomeFromPanelClasses(["enginedata-container", "enginedata-loss"]), "black");
    assert.equal(R.outcomeFromPanelClasses(["enginedata-container", "enginedata-draw"]), "draw");
    assert.equal(R.outcomeFromPanelClasses(["enginedata-container", "white-high-contrast-box"]), null);
  });

  test("a websocket result or final game update belongs to the watched game", () => {
    const watched = { plies: 157, white: "Reckless", black: "Torch", gameNumber: null };

    assert.equal(R.socketResultMatches({ whiteName: "Reckless", blackName: "Torch" }, watched), true);
    assert.equal(R.socketResultMatches({ whiteName: "Torch", blackName: "Reckless" }, watched), false);
    assert.equal(
      R.socketResultMatches({ whiteName: "Torch", blackName: "Reckless" }, { ...watched, white: "", black: "" }),
      true
    );

    const update = { gameNr: "212836", white: "Reckless", black: "Torch", plyCount: 157 };
    assert.equal(R.finalUpdateMismatch(update, watched, ["212836"]), null);
    assert.equal(R.finalUpdateMismatch(update, watched, ["212836", "212837"]), null);
    assert.equal(R.finalUpdateMismatch(update, watched, []), null);
    // an archived game the user opened
    assert.match(R.finalUpdateMismatch({ ...update, gameNr: "212300" }, watched, ["212836"]), /not a live game/);
    assert.match(R.finalUpdateMismatch({ ...update, plyCount: 120 }, watched, []), /120 plies/);
    assert.match(
      R.finalUpdateMismatch({ ...update, white: "Torch", black: "Reckless" }, watched, []),
      /Torch - Reckless/
    );
  });
});

describe("GameEndRules: moves and position", () => {
  test("isContinuation / isNextGame", () => {
    assert.equal(R.isContinuation(["e4"], ["e4", "e5"]), true);
    assert.equal(R.isContinuation(["e4", "e5"], ["e4", "e5"]), true);
    assert.equal(R.isContinuation(["e4", "e5"], ["e4"]), false);
    assert.equal(R.isContinuation(["e4", "e5"], ["d4", "e5", "c4"]), false);

    assert.equal(R.isNextGame({ plies: 120, watchedMs: 60_000 }, 16), true);
    assert.equal(R.isNextGame({ plies: 120, watchedMs: 4999 }, 16), false);
    assert.equal(R.isNextGame({ plies: 9, watchedMs: 60_000 }, 4), false);
    assert.equal(R.isNextGame({ plies: 16, watchedMs: 60_000 }, 16), false);
  });

  test("ply parity, FEN side to move, full moves", () => {
    assert.equal(R.sideToMove(0), "white");
    assert.equal(R.sideToMove(233), "black");
    assert.equal(R.sideToMoveFromFen("8/8/8/8/8/8/8/K6k b - - 0 1"), "black");
    assert.equal(R.sideToMoveFromFen(null), null);
    assert.equal(R.fullMoves(233), 117);
    assert.equal(R.fullMoves(100), 50);
    assert.equal(R.isMateSan("d7#"), true);
    assert.equal(R.isMateSan("Bxf7+"), false);
  });

  test("material: piece count, mating material, time forfeit outcome", () => {
    assert.equal(R.countPieces("8/8/8/Nk6/8/1b4P1/5K1P/8 b - - 0 50"), 6);
    assert.equal(R.hasMatingMaterial("8/8/8/8/8/8/k7/K6N w - - 0 1", "white"), false);
    assert.equal(R.hasMatingMaterial("8/8/8/8/8/8/k7/K5NN w - - 0 1", "white"), true);
    assert.equal(R.hasMatingMaterial("8/8/8/8/8/8/k6p/K7 w - - 0 1", "black"), true);
    assert.equal(R.timeForfeitOutcome("8/8/8/8/8/8/k7/K6N w - - 0 1", "black"), "draw");
    assert.equal(R.timeForfeitOutcome("8/8/8/8/8/8/k7/K5QN w - - 0 1", "black"), "white");
    assert.equal(R.timeForfeitOutcome(null, "white"), "black");
    assert.equal(R.isTablebaseDraw("draw"), true);
    assert.equal(R.isTablebaseDraw("cursed-win"), true);
    assert.equal(R.isTablebaseDraw("blessed-loss"), true);
    assert.equal(R.isTablebaseDraw("win"), false);
    assert.equal(R.isTablebaseDraw("maybe-win"), false);
    assert.equal(R.isTablebaseDraw(undefined), false);
  });
});

describe("GameEndRules: schedule", () => {
  const fakeRow = (cells, classes = []) => ({
    children: cells.map((text) =>
      text === null ? { tagName: "IMG", textContent: "" } : { tagName: "DIV", textContent: text }
    ),
    classList: { contains: (name) => classes.includes(name) },
    querySelector: () => null,
  });

  test("readScheduleRow parses finished and in-progress rows", () => {
    assert.deepEqual(
      plain(R.readScheduleRow(fakeRow(["467", null, "#1 Torch", "1-0 \n 86 Moves", "#2 Reckless", null]))),
      { gameNumber: "467", white: "Torch", black: "Reckless", outcome: "white", moveCount: 86, inProgress: false }
    );
    assert.deepEqual(
      plain(
        R.readScheduleRow(
          fakeRow(["468", null, "#2 Reckless", "In Progress...", "#1 Torch", null], [
            "schedule-game-link",
            "schedule-in-progress",
          ])
        )
      ),
      { gameNumber: "468", white: "Reckless", black: "Torch", outcome: null, moveCount: null, inProgress: true }
    );
    assert.equal(R.readScheduleRow(fakeRow(["469", "#1 Torch"])), null);
  });

  test("parseScore / parseScheduleCells", () => {
    assert.equal(R.parseScore("1-0 \n 86 Moves"), "white");
    assert.equal(R.parseScore("0-1"), "black");
    assert.equal(R.parseScore("1/2-1/2 \n 70 Moves"), "draw");
    assert.equal(R.parseScore("½-½"), "draw");
    assert.equal(R.parseScore("In Progress..."), null);
    assert.equal(R.parseScore(""), null);
    assert.equal(
      R.parseScheduleCells(["1", "#1 A", "1-0 \n 1 Move", "#2 B"], false).moveCount,
      1
    );
    assert.equal(R.parseScheduleCells(["1", "#1 A", "1-0", "#2 B"], true).outcome, null);
  });

  test("moveCountMatches: full moves of the watched plies, ±1", () => {
    assert.equal(R.moveCountMatches(86, 171), true);
    assert.equal(R.moveCountMatches(86, 172), true);
    assert.equal(R.moveCountMatches(86, 169), true);
    assert.equal(R.moveCountMatches(86, 174), true);
    assert.equal(R.moveCountMatches(86, 168), false);
    assert.equal(R.moveCountMatches(86, 175), false);
    assert.equal(R.moveCountMatches(null, 3), true);
  });

  test("namesMatch ignores ranks, case and punctuation; unknown matches", () => {
    assert.equal(R.namesMatch("Stockfish 17.1", "#3 Stockfish"), true);
    assert.equal(R.namesMatch("Torch", "torch"), true);
    assert.equal(R.namesMatch("Torch", "Reckless"), false);
    assert.equal(R.namesMatch("", "Reckless"), true);
  });

  test("pickFinishedRow: next game started", () => {
    const watched = { plies: 171, white: "Torch", black: "Reckless", gameNumber: null };
    const rows = [
      plain(R.parseScheduleCells(["466", "#2 Reckless", "1/2-1/2 \n 60 Moves", "#1 Torch"], false)),
      plain(R.parseScheduleCells(["467", "#1 Torch", "1-0 \n 86 Moves", "#2 Reckless"], false)),
      plain(R.parseScheduleCells(["468", "#2 Reckless", "In Progress...", "#1 Torch"], true)),
    ];

    const found = R.pickFinishedRow(rows, watched, "replaced");
    assert.equal(found.status, "found");
    assert.equal(found.row.gameNumber, "467");
    // move count, names, number of another game
    assert.equal(R.pickFinishedRow(rows, { ...watched, plies: 120 }, "replaced").status, "rejected");
    assert.equal(
      R.pickFinishedRow(rows, { ...watched, white: "Reckless", black: "Torch" }, "replaced").status,
      "rejected"
    );
    assert.equal(R.pickFinishedRow(rows, { ...watched, gameNumber: "468" }, "replaced").status, "pending");
    assert.equal(R.pickFinishedRow(rows, { ...watched, gameNumber: "467" }, "replaced").status, "found");
    // result not shown yet
    const noResult = rows.map((row) => (row.gameNumber === "467" ? { ...row, outcome: null } : row));
    assert.equal(R.pickFinishedRow(noResult, watched, "replaced").status, "pending");
    // first game of the schedule in progress
    assert.equal(R.pickFinishedRow(rows.slice(2), watched, "replaced").status, "rejected");
    // a game is in progress: not the event end
    assert.equal(R.pickFinishedRow(rows, watched, "event-end").status, "pending");
  });

  test("pickFinishedRow: event end", () => {
    const watched = { plies: 171, white: "Torch", black: "Reckless", gameNumber: null };
    const rows = [
      plain(R.parseScheduleCells(["466", "#2 Reckless", "1/2-1/2 \n 60 Moves", "#1 Torch"], false)),
      plain(R.parseScheduleCells(["467", "#1 Torch", "1-0 \n 86 Moves", "#2 Reckless"], false)),
    ];

    assert.equal(R.pickFinishedRow(rows, watched, "event-end").row.gameNumber, "467");
    assert.equal(R.pickFinishedRow(rows, { ...watched, gameNumber: "467" }, "event-end").status, "found");
    assert.equal(R.pickFinishedRow(rows, { ...watched, plies: 300 }, "event-end").status, "pending");
  });

  test(
    "pickFinishedRow at the event end never takes an older game with the same colors",
    () => {
      // game pairs: the game two rows up has the same engines with the same
      // colors; the watched game's own row has no result yet
      const watched = { plies: 100, white: "Torch", black: "Reckless", gameNumber: null };
      const rows = [
        plain(R.parseScheduleCells(["465", "#1 Torch", "1-0 \n 50 Moves", "#2 Reckless"], false)),
        plain(R.parseScheduleCells(["466", "#2 Reckless", "0-1 \n 70 Moves", "#1 Torch"], false)),
        plain(R.parseScheduleCells(["467", "#1 Torch", "", "#2 Reckless"], false)),
      ];

      assert.equal(R.pickFinishedRow(rows, watched, "event-end").status, "pending");
    }
  );

  test("formatReason", () => {
    assert.equal(R.formatReason("Game 467", 86, true), "Corrected result · Game 467 · 86 moves");
    assert.equal(R.formatReason("Checkmate", 7, false), "Checkmate · 7 moves");
    assert.equal(R.formatReason("", null, false), "");
  });
});

describe("GameEndArbiter", () => {
  test("the first result is shown", () => {
    const decision = A.decide(null, candidate("draw", "provisional", "adjudication"));
    assert.equal(decision.notify, true);
    assert.equal(decision.corrected, false);
    assert.equal(decision.next.outcome, "draw");
    assert.equal(decision.next.confidence, "provisional");
  });

  test("provisional then confirmed: silent if the same, corrected if not", () => {
    const shown = A.decide(null, candidate("draw", "provisional", "adjudication")).next;

    const same = A.decide(shown, candidate("draw", "confirmed", "schedule"));
    assert.equal(same.notify, false);
    assert.equal(same.next.confidence, "confirmed");

    const other = A.decide(shown, candidate("white", "confirmed", "schedule"));
    assert.equal(other.notify, true);
    assert.equal(other.corrected, true);
    assert.equal(other.next.outcome, "white");

    const certain = A.decide(shown, candidate("black", "certain", "tablebase"));
    assert.equal(certain.notify, true);
    assert.equal(certain.corrected, true);
  });

  test("one provisional result per game", () => {
    const shown = A.decide(null, candidate("draw", "provisional", "adjudication")).next;
    assert.equal(A.decide(shown, candidate("white", "provisional", "time-forfeit")).notify, false);
  });

  test("a certain or confirmed result is final", () => {
    const certain = { outcome: "white", confidence: "certain", source: "board", refuted: false };
    assert.equal(A.decide(certain, candidate("black", "confirmed", "schedule")).notify, false);
    assert.equal(A.decide(certain, candidate("white", "certain", "board")).notify, false);
    const confirmed = { outcome: "draw", confidence: "confirmed", source: "schedule", refuted: false };
    assert.equal(A.decide(confirmed, candidate("white", "provisional", "time-forfeit")).notify, false);
  });

  test("a refuted result is replaced by the next one", () => {
    const refuted = { outcome: "draw", confidence: "provisional", source: "adjudication", refuted: true };
    const decision = A.decide(refuted, candidate("white", "confirmed", "schedule"));
    assert.equal(decision.notify, true);
    assert.equal(decision.corrected, true);

    const sameOutcome = A.decide(refuted, candidate("draw", "certain", "board"));
    assert.equal(sameOutcome.notify, true);
    assert.equal(sameOutcome.corrected, false);
  });

  test(
    "a detector refuted in this game is not shown again",
    () => {
      const refutedTablebase = { outcome: "draw", confidence: "certain", source: "tablebase", refuted: true };
      const again = A.decide(refutedTablebase, candidate("draw", "certain", "tablebase"));
      assert.equal(again.notify, false);
      assert.equal(again.next.refuted, true);
      // other detectors still are
      assert.equal(A.decide(refutedTablebase, candidate("draw", "certain", "board")).notify, true);
      assert.equal(A.decide(refutedTablebase, candidate("white", "confirmed", "schedule")).notify, true);
    }
  );
});

// * =========================
// * scenarios: the scripts on a fake page, virtual time

/** a live game already in progress when the page is loaded */
async function startLiveGame({ book = RUY, schedule = [], enginesTab = true, setup } = {}) {
  const world = createWorld();
  world.page.enginesTab = enginesTab;
  world.page.schedule = schedule;
  setup?.(world);
  const live = new LiveGame(world, { book });
  world.start();
  await world.advance(1000);
  return { world, live };
}

const scheduleClicks = (world) =>
  world.page.tabClicks.filter((click) => click.name === "schedule").length;

const toastSummary = (world) =>
  world.toasts.map(({ outcome, white, black, reason }) => ({ outcome, white, black, reason }));

function assertNoErrors(world) {
  assert.deepEqual(world.errors.map(String), []);
}

/** game 41 Torch - Reckless in progress, game 40 finished */
const SCHEDULE_DURING_41 = [
  scheduleRow(40, "Reckless", "Torch", "0-1 \n 50 Moves"),
  scheduleRow(41, "Torch", "Reckless"),
];
/** game 41 finished with `score`, game 42 in progress */
const scheduleAfter41 = (score) => [
  scheduleRow(40, "Reckless", "Torch", "0-1 \n 50 Moves"),
  scheduleRow(41, "Torch", "Reckless", score),
  scheduleRow(42, "Reckless", "Torch"),
];

describe("scripts", () => {
  test("the manifest loads the game end scripts in the order the harness does", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC_DIR, "manifest.json"), "utf8"));
    const js = manifest.content_scripts[0].js;
    const positions = SCRIPTS.map((file) => js.indexOf(file));

    assert.ok(positions.every((index) => index !== -1), `missing: ${SCRIPTS.filter((f) => !js.includes(f))}`);
    assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  });
});

describe("board results", () => {
  test("mate: one toast as soon as the moves table settles", async () => {
    const { world, live } = await startLiveGame({ book: LEGALL.slice(0, 8) });

    await live.playMoves(LEGALL.slice(8), { thinkMs: 2000 });
    const mateAt = world.t;
    await world.advance(1000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Checkmate · 7 moves" },
    ]);
    assert.ok(world.toasts[0].t - mateAt <= C.SETTLE_DELAY_MS + 100, `${world.toasts[0].t - mateAt} ms`);

    // rendered over the board, removed after its animation
    const [element] = world.toastElements();
    assert.equal(element.textContent, "Torch wins·1-0Checkmate · 7 moves");
    assert.equal(element.getAttribute("role"), "status");
    await world.advance(4000);
    assert.equal(world.toastElements().length, 0);

    // the next game replaces the table: nothing more, the schedule is not needed
    await world.advance(10_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 7 Moves") });
    await world.advance(20_000);

    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("mate in a real CCC game: no toast before it, one at the mate", async () => {
    const world = createWorld();
    await playArchivedGame(world, MATE_GAME);
    const mateAt = world.t;
    await world.advance(1000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Checkmate · 62 moves" },
    ]);
    assert.ok(world.toasts[0].t >= mateAt);
    assertNoErrors(world);
  });

  test("stalemate", async () => {
    const { world, live } = await startLiveGame({ book: LOYD_STALEMATE.slice(0, 10) });

    await live.playMoves(LOYD_STALEMATE.slice(10), { thinkMs: 1500 });
    await world.advance(1000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Stalemate · 10 moves" },
    ]);
    assert.equal(world.toastElements()[0].textContent, "Draw·½-½Stalemate · 10 moves");
    assertNoErrors(world);
  });

  test("threefold repetition in a real CCC game", async () => {
    const world = createWorld();
    await playArchivedGame(world, THREEFOLD_GAME);
    const lastMoveAt = world.t;
    await world.advance(1000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Threefold repetition · 44 moves" },
    ]);
    assert.ok(world.toasts[0].t >= lastMoveAt);
    assertNoErrors(world);
  });

  test("monitor6.jsonl (recorded live game, ended by mate): one toast, at the mate", async () => {
    const samples = parseMonitor(readFixture("monitor6.jsonl"));
    // the recording only has the ply count and the last move: the first 26
    // plies are known, the other moves are placeholders chess.js can't
    // replay (so only the "#" is seen, like when chess.js fails)
    const known = "Nf3 e6 c4 f5 b3 Nf6 Bb2 d6 d4 Be7 e3 O-O Bd3 a5 Nc3 Na6 O-O Nb4 Be2 d5 Ne5 Bd7 a3 Nc6 Nd3 Be8".split(" ");
    const lastByPly = new Map(samples.map((sample) => [sample.plies, sample.last]));
    const moves = Array.from({ length: 233 }, (_, i) => known[i] ?? lastByPly.get(i + 1) ?? `?${i + 1}`);
    const mateSample = samples.find((sample) => sample.last === "d7#");
    const nextGameSample = samples.find((sample) => sample.t > mateSample.t && sample.plies === 16);

    const world = createWorld();
    await replayMonitor(world, samples, { pgnFor: (plies) => moves.slice(0, plies) });

    const mateAt = (mateSample.t - samples[0].t) * 1000;
    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Checkmate · 117 moves" },
    ]);
    assert.ok(world.toasts[0].t >= mateAt && world.toasts[0].t <= mateAt + 1000, `${world.toasts[0].t - mateAt} ms`);
    // the next game was shown (book moves, colors swapped) without a second toast
    assert.ok(nextGameSample.t < samples.at(-1).t);
    assert.equal(world.eval("GameEndWatcher.session.plies"), 16);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });
});

describe("tablebase", () => {
  /** legal moves from the final position of TABLEBASE_GAME (6 men, black to move) */
  const AFTER_TABLEBASE_DRAW = ["Kxa5", "g4", "Kb4", "h4", "Kc3", "g5"];

  test("drawn 6-man position in a real CCC game: one toast once the engine to move stays idle", async () => {
    const world = createWorld();
    world.tablebase = () => "draw";

    await playArchivedGame(world, TABLEBASE_GAME);
    const lastMoveAt = world.t;
    await world.advance(3000);

    // asked once: the only capture leaving 6 pieces or less
    assert.equal(world.fetches.length, 1);
    assert.equal(R.countPieces(world.fetches[0].fen), 6);
    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Tablebase draw · 50 moves" },
    ]);
    // the freeze rule: the engine to move printed nothing for FREEZE_MS
    const delay = world.toasts[0].t - lastMoveAt;
    assert.ok(delay >= C.FREEZE_MS && delay <= C.FREEZE_MS + C.TICK_MS + 100, `${delay} ms`);

    // the next game: the schedule agrees, no second toast and no tab opened
    await world.advance(11_000);
    new LiveGame(world).replaceWithNextGame(NEXT_BOOK, {
      schedule: scheduleAfter41("1/2-1/2 \n 50 Moves"),
    });
    await world.advance(20_000);
    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("a draw answer arriving after the next move is ignored", async () => {
    const world = createWorld();
    const finalFen = "8/8/8/Nk6/8/1b4P1/5K1P/8 b - - 0 50";
    world.tablebase = (fen) =>
      fen === finalFen ? { category: "draw", delayMs: 2500 } : "win";

    const { live } = await playArchivedGame(world, TABLEBASE_GAME);
    await live.think(1500, { everyMs: 0 });
    live.move(AFTER_TABLEBASE_DRAW[0]);
    await live.think(2000);
    live.move(AFTER_TABLEBASE_DRAW[1]);
    await world.advance(5000);

    assert.equal(world.fetches[0].fen, finalFen);
    assert.ok(world.fetches.length >= 2);
    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("a draw answered at once is ignored if a move follows within the freeze delay", async () => {
    const world = createWorld();
    world.tablebase = (fen) => (R.countPieces(fen) === 6 ? "draw" : "win");

    const { live } = await playArchivedGame(world, TABLEBASE_GAME);
    await world.advance(C.FREEZE_MS - 500);
    live.move(AFTER_TABLEBASE_DRAW[0]);
    await world.advance(3000);

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("tablebase offline or rate limited: no toast, no error", async () => {
    for (const answer of [{ fail: true }, { status: 429 }, { category: undefined }]) {
      const world = createWorld();
      world.tablebase = () => answer;

      await playArchivedGame(world, TABLEBASE_GAME);
      await world.advance(2000);

      assert.equal(world.fetches.length, 1, JSON.stringify(answer));
      assert.equal(world.toasts.length, 0, JSON.stringify(answer));
      assertNoErrors(world);
    }
  });

  test("a drawn position CCC does not adjudicate: the engines keep searching, no toast", async () => {
    const world = createWorld();
    world.tablebase = () => "draw";

    const { live } = await playArchivedGame(world, TABLEBASE_GAME);
    for (const san of AFTER_TABLEBASE_DRAW) {
      await live.think(1500);
      live.move(san);
    }
    await live.think(1500);

    assert.equal(world.toasts.length, 0);
    // asked for the captures only (Nxa5 to 6 men, Kxa5 to 5)
    assert.equal(world.fetches.length, 2);
    assertNoErrors(world);
  });

  test("an engine silent for a while after a drawn capture: one toast, refuted, not again", async () => {
    const world = createWorld();
    world.tablebase = () => "draw";

    const { live } = await playArchivedGame(world, TABLEBASE_GAME);
    // no search line for 2 s (deep TB think): the freeze rule confirms
    await live.think(2000, { everyMs: 0 });
    assert.equal(world.toasts.length, 1);

    // it moves after all (a capture, still a TB draw), then is silent again
    live.move(AFTER_TABLEBASE_DRAW[0]);
    await live.think(2500, { everyMs: 0 });
    for (const san of AFTER_TABLEBASE_DRAW.slice(1)) {
      live.move(san);
      await live.think(1500);
    }

    assert.equal(world.toasts.length, 1);
    assertNoErrors(world);
  });
});

describe("schedule result", () => {
  test("Engines tab hidden (no panels, no stats): the schedule tells the result once the next game starts", async () => {
    const { world, live } = await startLiveGame({ enginesTab: false, schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    // game over: nothing on the page says so
    await world.advance(14_000);
    assert.equal(world.toasts.length, 0);

    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 13 Moves") });
    await world.advance(15_000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Game 41 · 13 moves" },
    ]);
    // the schedule tab was opened for a moment, then the previous tab again
    assert.equal(scheduleClicks(world), 1);
    assert.equal(world.page.selectedTab, "standings");
    assertNoErrors(world);
  });

  test("schedule tab open: read without clicking", async () => {
    const { world, live } = await startLiveGame({
      enginesTab: false,
      schedule: SCHEDULE_DURING_41,
      setup: (w) => (w.page.selectedTab = "schedule"),
    });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(14_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1/2-1/2 \n 13 Moves") });
    await world.advance(15_000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Game 41 · 13 moves" },
    ]);
    assert.equal(world.page.tabClicks.length, 0);
    assertNoErrors(world);
  });

  test("the result appears in the schedule a few seconds after the next game", async () => {
    const { world, live } = await startLiveGame({ enginesTab: false, schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(14_000);
    live.replaceWithNextGame(NEXT_BOOK, {
      schedule: [SCHEDULE_DURING_41[0], scheduleRow(41, "Torch", "Reckless", ""), scheduleRow(42, "Reckless", "Torch")],
    });
    await world.advance(3000);
    world.page.schedule = scheduleAfter41("0-1 \n 13 Moves");
    await world.advance(10_000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "black", white: "Torch", black: "Reckless", reason: "Game 41 · 13 moves" },
    ]);
    assertNoErrors(world);
  });

  test("re-loaded older game: the schedule row of another game is not reported", async () => {
    const { world, live } = await startLiveGame({ enginesTab: false });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(2000);
    // replaced by a shorter game while the schedule shows an older result
    live.replaceWithNextGame(NEXT_BOOK, {
      swapColors: false,
      schedule: [scheduleRow(40, "Torch", "Reckless", "1-0 \n 60 Moves"), scheduleRow(41, "Torch", "Reckless")],
    });
    await world.advance(15_000);

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("crash replay of an older game's final position (mate): not reported", async () => {
    const { world, live } = await startLiveGame();

    await live.playMoves(RUY_MORE.slice(0, 6), { thinkMs: 2000, toMoveLeft: 60 });
    // the table jumps to another, longer game that ended by mate
    world.page.pgn = MATE_GAME.plies.map((ply) => ply[0]);
    world.mutate();
    await world.advance(20_000);

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("event end (no next game): the result is read from the last finished row", async () => {
    const { world, live } = await startLiveGame({ enginesTab: false, schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(20_000);
    // the event is over: game 41 finished, nothing in progress
    world.page.schedule = scheduleAfter41("1-0 \n 13 Moves").slice(0, 2);
    await world.advance(60_000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Game 41 · 13 moves" },
    ]);
    await world.advance(180_000);
    assert.equal(world.toasts.length, 1);
    assert.ok(scheduleClicks(world) <= C.EVENT_END_MAX_CHECKS);
    assert.equal(world.page.selectedTab, "standings");
    assertNoErrors(world);
  });

  test(
    "event end is still checked after long thinks used the checks during the game",
    async () => {
      const { world, live } = await startLiveGame({ enginesTab: false, schedule: SCHEDULE_DURING_41 });

      await live.playMoves(RUY_MORE.slice(0, 6), { thinkMs: 50_000 });
      await world.advance(20_000);
      world.page.schedule = scheduleAfter41("1-0 \n 11 Moves").slice(0, 2);
      await world.advance(120_000);

      assert.equal(world.toasts.length, 1);
    }
  );

  test("no tab buttons (some layouts) and no panels: no click, no error", async () => {
    const { world, live } = await startLiveGame({
      enginesTab: false,
      schedule: SCHEDULE_DURING_41,
      setup: (w) => (w.page.noTabButtons = true),
    });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(14_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 13 Moves") });
    await world.advance(15_000);
    await world.advance(120_000);

    assert.equal(world.toasts.length, 0);
    assert.equal(world.page.tabClicks.length, 0);
    assertNoErrors(world);
  });

  test(
    "the next game replaces the table between two ticks: the schedule result is still found",
    async () => {
      const missed = [];
      for (let phase = 0; phase < C.TICK_MS; phase += 50) {
        const { world, live } = await startLiveGame({
          schedule: SCHEDULE_DURING_41,
          setup: (w) => {
            // evals that make no adjudication guess
            w.page.evals = { white: "+ 1.50", black: "+ 1.40" };
            w.page.statsEvals = ["+1.50", "+1.40"];
          },
        });

        await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
        await world.advance(12_000 + phase);
        live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 13 Moves") });
        await world.advance(15_000);

        const reasons = world.toasts.map((toast) => toast.reason);
        if (reasons.join() !== "Game 41 · 13 moves") missed.push(`${phase} ms: ${JSON.stringify(reasons)}`);
      }

      assert.deepEqual(missed, []);
    }
  );

  test(
    "the schedule shows the next game in progress before the table changes: its number is not taken",
    async () => {
      const { world, live } = await startLiveGame({
        schedule: SCHEDULE_DURING_41,
        setup: (w) => {
          w.page.evals = { white: "+ 1.50", black: "+ 1.40" };
          w.page.statsEvals = ["+1.50", "+1.40"];
        },
      });

      await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
      await world.advance(10_000);
      // the user opens the schedule; it already shows game 42 in progress
      world.page.schedule = scheduleAfter41("1-0 \n 13 Moves");
      world.page.selectedTab = "schedule";
      await world.advance(3000);
      live.replaceWithNextGame(NEXT_BOOK);
      await world.advance(15_000);

      assert.equal(world.toasts.length, 1);
    }
  );
});

describe("CCC websocket (inject/index.js)", () => {
  test("result message: a certain toast 0.2 s after the last move, nothing more", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
    const lastMoveAt = world.t;
    // before the moves table settled: the final move is counted anyway
    await world.advance(200);
    world.socketResult({ score: "1/2-1/2", reason: "Draw by adjudication: SyzygyTB" });

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Tablebase draw · 13 moves" },
    ]);
    assert.equal(world.toasts[0].t - lastMoveAt, 200);

    // the final ply settling, the freeze, the next game: nothing more
    await world.advance(14_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1/2-1/2 \n 13 Moves") });
    await world.advance(15_000);
    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("result of other engines, or posted by someone else: ignored", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
    await world.advance(300);
    world.socketResult({ whiteName: "Reckless", blackName: "Torch", score: "0-1", reason: "White mates" });
    world.pageMessage("result", { whiteName: "Torch", blackName: "Reckless", score: "1-0" }, { source: "page" });
    world.pageMessage("result", { whiteName: "Torch", blackName: "Reckless", score: "1-0" }, { fromWindow: false });
    await world.advance(2000);
    assert.equal(world.toasts.length, 0);

    // the schedule still tells the result
    await world.advance(12_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 13 Moves") });
    await world.advance(15_000);
    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Game 41 · 13 moves" },
    ]);
    assertNoErrors(world);
  });

  test("final game update of the live game: confirmed toast; of an archived game: ignored", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });
    world.socketGameUpdate({ gameNr: "212836", live: true });

    await live.playMoves(RUY_MORE.slice(0, 6), { thinkMs: 2000, toMoveLeft: 60 });
    // the user opened another game a moment ago (no hash change yet)
    world.socketGameUpdate({
      gameNr: "212300",
      termination: "whiteMates",
      outcome: "1-0",
      white: "Torch",
      black: "Reckless",
      plyCount: 22,
    });
    await live.playMoves(RUY_MORE.slice(6), { thinkMs: 2000, toMoveLeft: 60 });
    await world.advance(13_800);
    assert.equal(world.toasts.length, 0);

    world.socketGameUpdate({
      gameNr: "212836",
      termination: "drawAdj",
      outcome: "1/2-1/2",
      white: "Torch",
      black: "Reckless",
      plyCount: 26,
    });
    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Adjudication · 13 moves" },
    ]);

    await world.advance(1000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1/2-1/2 \n 13 Moves") });
    await world.advance(15_000);
    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("the page hook forwards result and finished game updates, installed late", () => {
    const posted = [];
    const timers = [];
    let app = null;
    const previous = [];
    const handlers = {
      newMove() {},
      gameUpdate() {},
      after_gameUpdate: (messages) => previous.push(messages),
    };

    const ctx = vm.createContext({
      window: {
        location: { origin: "https://www.chess.com" },
        postMessage: (data, origin) => posted.push({ data, origin }),
        setTimeout: (fn) => timers.push(fn),
      },
      document: { querySelector: (selector) => (selector === "#app" ? app : null) },
    });
    vm.runInContext(fs.readFileSync(path.join(SRC_DIR, "inject/index.js"), "utf8"), ctx);

    // the app isn't wired yet: retried
    assert.equal(timers.length, 1);
    app = { __vue_app__: { config: { globalProperties: { $socket: { handlers } } } } };
    timers.shift()();
    assert.equal(typeof handlers.result, "function");

    handlers.result({
      type: "result",
      whiteName: "Reckless",
      blackName: "Torch",
      score: "1/2-1/2",
      reason: "Draw by adjudication: SyzygyTB",
    });
    const finished = {
      type: "gameUpdate",
      gameDetails: {
        gameNr: 212836,
        termination: "drawSyzygy",
        outcome: "1/2-1/2",
        pgn: '[White "Reckless"]\n[Black "Torch"]\n[PlyCount "157"]\n\n1. Nf3 {book}',
      },
    };
    handlers.after_gameUpdate([finished]);

    // the app's own after_ handler still runs
    assert.equal(previous.length, 1);
    assert.deepEqual(
      posted.map(({ data, origin }) => [origin, plain(R.parsePageMessage(data))]),
      [
        [
          "https://www.chess.com",
          {
            type: "result",
            whiteName: "Reckless",
            blackName: "Torch",
            outcome: "draw",
            reason: "Draw by adjudication: SyzygyTB",
          },
        ],
        [
          "https://www.chess.com",
          {
            type: "gameUpdate",
            gameNr: "212836",
            live: false,
            termination: "drawSyzygy",
            outcome: "draw",
            white: "Reckless",
            black: "Torch",
            plyCount: 157,
          },
        ],
      ]
    );

    // installed once
    vm.runInContext(fs.readFileSync(path.join(SRC_DIR, "inject/index.js"), "utf8"), ctx);
    handlers.result({ type: "result", score: "1-0" });
    assert.equal(posted.length, 3);
  });
});

describe("eval draw and freeze rules", () => {
  test("eval draw in a real CCC game: one toast once the engine to move stays idle", async () => {
    const world = createWorld();

    await playArchivedGame(world, ADJUDICATED_GAME);
    const lastMoveAt = world.t;
    await world.advance(3000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Adjudication · 50 moves" },
    ]);
    const delay = world.toasts[0].t - lastMoveAt;
    assert.ok(delay >= C.FREEZE_MS && delay <= C.FREEZE_MS + C.TICK_MS + 100, `${delay} ms`);

    // the schedule agrees: no second toast, no tab opened
    await world.advance(11_000);
    new LiveGame(world).replaceWithNextGame(NEXT_BOOK, {
      schedule: scheduleAfter41("1/2-1/2 \n 50 Moves"),
    });
    await world.advance(20_000);
    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("the page shows the result ~14 s later and rebuilds the evals: no second toast", async () => {
    const world = createWorld();

    await playArchivedGame(world, ADJUDICATED_GAME);
    await world.advance(13_900);
    assert.equal(world.toasts.length, 1);

    // the final game update: result box, panel colors, evals from the PGN
    world.page.resultBox = {
      classes: ["movetable-gameResult", "movetable-draw"],
      text: "Draw 1/2 - 1/2 Adjudication",
    };
    world.page.panelResult = { white: "enginedata-draw", black: "enginedata-draw" };
    world.page.evals = { white: "- 0.00", black: "- 0.00" };
    await world.advance(30_000);

    assert.equal(world.toasts.length, 1);
    assert.equal(world.eval("GameEndWatcher.session.shown.confidence"), "confirmed");
    assertNoErrors(world);
  });

  test("the eval draw rule fires but the engine to move searches on: no toast", async () => {
    const world = createWorld();

    const { live } = await playArchivedGame(world, ADJUDICATED_GAME);
    await live.think(5000, { everyMs: 500 });

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("the eval draw rule needs the plies seen: a page loaded late can't use it", async () => {
    const world = createWorld();
    // the page opens 10 plies before the end
    const late = { ...ADJUDICATED_GAME, plies: ADJUDICATED_GAME.plies.map((ply, i) => (i < 90 ? [ply[0], null, null, null] : ply)) };

    await playArchivedGame(world, late);
    await world.advance(5000);

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("an end nothing explains: no toast, then the result box of the page (end of an event)", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
    await world.advance(13_900);
    assert.equal(world.toasts.length, 0);
    assert.equal(world.eval("GameEndWatcher.session.endedAt !== null"), true);

    world.page.resultBox = {
      classes: ["movetable-gameResult", "movetable-white"],
      text: "White Won 1 - 0 Disconnection",
    };
    world.page.panelResult = { white: "enginedata-win", black: "enginedata-loss" };
    await world.advance(500);

    assert.deepEqual(toastSummary(world), [
      { outcome: "white", white: "Torch", black: "Reckless", reason: "Disconnection · 13 moves" },
    ]);
    await world.advance(120_000);
    assert.equal(world.toasts.length, 1);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("only the engine panels' colors: confirmed toast without a reason", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000, toMoveLeft: 60 });
    await world.advance(13_900);
    world.page.panelResult = { white: "enginedata-draw", black: "enginedata-draw" };
    await world.advance(500);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "13 moves" },
    ]);
    assertNoErrors(world);
  });
});

describe("time forfeit", () => {
  test("the engine to move searched until its clock ran out: it loses on time", async () => {
    const { world, live } = await startLiveGame();

    await live.playMoves(RUY_MORE.slice(0, 4), { thinkMs: 2000, toMoveLeft: 3.5 });
    const lastMoveAt = world.t;
    // white searches (a line every 500 ms) until its 3.5 s are gone
    await live.think(3500, { everyMs: 500 });
    await world.advance(3000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "black", white: "Torch", black: "Reckless", reason: "Time forfeit · 10 moves" },
    ]);
    const delay = world.toasts[0].t - lastMoveAt;
    assert.ok(delay >= 3500 + C.OVERTIME_GRACE_MS && delay <= 3500 + C.OVERTIME_GRACE_MS + C.TICK_MS + 100, `${delay} ms`);
    assertNoErrors(world);
  });

  test("the engines had stopped before the clock ran out (it keeps counting): not a time forfeit", async () => {
    const { world, live } = await startLiveGame();

    await live.playMoves(RUY_MORE.slice(0, 4), { thinkMs: 2000, toMoveLeft: 2.11 });
    await world.advance(10_000);

    assert.equal(world.toasts.length, 0);
    assert.equal(world.eval("GameEndWatcher.session.endedAt !== null"), true);
    assertNoErrors(world);
  });
});

describe("page changes", () => {
  test("archived game opened during play: nothing reported, the live game is resumed", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE.slice(0, 4), { thinkMs: 2000, toMoveLeft: 60 });
    const sessionId = world.eval("GameEndWatcher.session.id");
    const livePgn = world.page.pgn.slice();

    // CCC puts game=N in the hash and shows that game (here: one ending by mate)
    world.setHash("#event=514&game=212300");
    world.page.pgn = LEGALL.slice();
    world.mutate();
    await world.advance(3000);
    world.page.pgn = MATE_GAME.plies.map((ply) => ply[0]);
    world.mutate();
    await world.advance(3000);
    assert.equal(world.eval("GameEndWatcher.session"), null);

    // back to the live game
    world.setHash("#event=514");
    world.page.pgn = livePgn;
    world.mutate();
    await world.advance(1000);
    assert.equal(world.eval("GameEndWatcher.session.id"), sessionId);

    await live.playMoves(RUY_MORE.slice(4, 6), { thinkMs: 2000, toMoveLeft: 60 });
    await world.advance(2000);

    assert.equal(world.toasts.length, 0);
    assert.equal(scheduleClicks(world), 0);
    assertNoErrors(world);
  });

  test("archived game shown a moment before the hash changes: nothing reported", async () => {
    const { world, live } = await startLiveGame({ schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE.slice(0, 4), { thinkMs: 2000, toMoveLeft: 60 });
    world.page.pgn = LEGALL.slice();
    world.mutate();
    await world.advance(600);
    world.setHash("#event=514&game=212300");
    await world.advance(15_000);

    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("page opened on an archived game: nothing reported", async () => {
    const world = createWorld();
    world.page.hash = "#event=514&game=212300";
    world.page.pgn = LEGALL.slice();
    world.start();
    await world.advance(5000);
    world.mutate();
    await world.advance(5000);

    assert.equal(world.eval("GameEndWatcher.session"), null);
    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("moves table re-rendered after the result: no second toast", async () => {
    const { world, live } = await startLiveGame({ book: LEGALL.slice(0, 8) });
    await live.playMoves(LEGALL.slice(8), { thinkMs: 2000 });
    await world.advance(1000);
    assert.equal(world.toasts.length, 1);

    const full = world.page.pgn.slice();
    const rerender = async (steps) => {
      for (const [pgn, ms] of steps) {
        world.page.pgn = pgn.slice();
        world.mutate();
        await world.advance(ms);
      }
    };

    // same moves
    await rerender([[full, 1000]]);
    // emptied and refilled, faster than the settle delay
    await rerender([[[], 100], [full, 1000]]);
    // emptied for a while
    await rerender([[[], 1500], [full, 1000]]);
    // half the moves first, then all of them
    await rerender([[full.slice(0, 6), 1000], [full, 1000]]);

    assert.equal(world.toasts.length, 1);
    assertNoErrors(world);
  });
});

describe("hidden tab", () => {
  test("mate while the tab is hidden: notified (chime), no toast element", async () => {
    const { world, live } = await startLiveGame({ book: LEGALL.slice(0, 8) });
    world.page.hidden = true;

    await live.playMoves(LEGALL.slice(8), { thinkMs: 2000 });
    await world.advance(1000);

    assert.equal(world.toasts.length, 1);
    assert.equal(world.toastElements().length, 0);
    assertNoErrors(world);
  });

  test("background tab (timers once a second): one toast for a real game", async () => {
    const world = createWorld();
    world.time.alignMs = 1000;
    world.page.hidden = true;

    await playArchivedGame(world, THREEFOLD_GAME);
    const lastMoveAt = world.t;
    await world.advance(5000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Threefold repetition · 44 moves" },
    ]);
    assert.ok(world.toasts[0].t - lastMoveAt <= 1500, `${world.toasts[0].t - lastMoveAt} ms`);
    assertNoErrors(world);
  });

  test("intensive throttling (timers once a minute): no wrong result, the real one comes late", async () => {
    const world = createWorld();
    world.time.alignMs = 60_000;
    world.page.hidden = true;

    await playArchivedGame(world, THREEFOLD_GAME);
    const lastMoveAt = world.t;
    await world.advance(70_000);

    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Threefold repetition · 44 moves" },
    ]);
    assert.ok(world.toasts[0].t - lastMoveAt <= 61_000);
    assertNoErrors(world);
  });
});

describe("memory and timers", () => {
  test("remembered results and tablebase answers are bounded", () => {
    const world = createWorld().start();

    world.eval(`
      for (let i = 0; i < 50; i++) {
        GameEndWatcher.rememberResult({
          positionKey: "position " + i,
          shown: { outcome: "draw", confidence: "certain", refuted: false },
        });
      }
      for (let i = 0; i < 600; i++) TablebaseDetector.remember("fen " + i, false);
    `);

    assert.equal(world.eval("GameEndWatcher.resultsByPosition.size"), world.eval("GameEndWatcher.RESULTS_KEPT"));
    assert.equal(world.eval("TablebaseDetector.cache.size"), C.TABLEBASE_CACHE_SIZE);
    // the newest are kept
    assert.equal(world.eval(`GameEndWatcher.resultsByPosition.has("position 49")`), true);
    assert.equal(world.eval(`TablebaseDetector.cache.has("fen 0")`), false);
  });

  test("no timer left behind once a game is over and the next one started", async () => {
    const { world, live } = await startLiveGame({ enginesTab: false, schedule: SCHEDULE_DURING_41 });

    await live.playMoves(RUY_MORE, { thinkMs: 2000 });
    await world.advance(14_000);
    live.replaceWithNextGame(NEXT_BOOK, { schedule: scheduleAfter41("1-0 \n 13 Moves") });
    await world.advance(30_000);

    assert.equal(world.toasts.length, 1);
    // only the 500 ms tick is still scheduled
    assert.equal(world.time.timers.size, 1);
    assertNoErrors(world);
  });
});
