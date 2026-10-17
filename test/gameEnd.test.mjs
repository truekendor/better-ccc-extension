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

const { GameEndRules: R, GameEndArbiter: A, GameEndConfig: C } = loadLogic();

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

const reading = (magnitude, isMate = false, whitePov = null) => ({
  color: null,
  text: "",
  magnitude,
  isMate,
  whitePov,
});
const candidate = (outcome, confidence, source = "board") => ({
  outcome,
  confidence,
  source,
  reason: "",
});

// * =========================
// * pure functions

describe("GameEndRules: evals", () => {
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

  test("parsePanelEval takes the token after the engine rank", () => {
    assert.deepEqual(plain(R.parsePanelEval("Torch #1 + 0.80 2:13")), { pawns: 0.8, mateIn: null });
    assert.deepEqual(plain(R.parsePanelEval("Reckless #2 + 4.45 13/50 0:01.11")), {
      pawns: 4.45,
      mateIn: null,
    });
    assert.deepEqual(plain(R.parsePanelEval("Reckless #2 +M1")), { pawns: 1000, mateIn: 1 });
    assert.deepEqual(plain(R.parsePanelEval("Torch #1 +M15 0:08")), { pawns: 1000, mateIn: 15 });
    assert.deepEqual(plain(R.parsePanelEval("Torch\n#1\n+ 0.01\n0:14")), { pawns: 0.01, mateIn: null });
    assert.equal(R.parsePanelEval("Torch #1 3:02"), null);
    assert.equal(R.parsePanelEval("Torch\n#1\n3:02"), null);
    assert.equal(R.parsePanelEval(""), null);
  });

  test("parseStatsEvals finds one eval per stats row", () => {
    const rows = (text) =>
      Array.from(R.parseStatsEvals(text), (parsed) => parsed.mateIn ?? parsed.pawns);

    assert.deepEqual(
      rows("+1.01 25 537.49M 2:08 171.28M 60 +0.80 36 1.02B 2:20 155.30M 245 481216-1.5-1-0.500.511.5"),
      [1.01, 0.8]
    );
    // first move of a game: one row, no time column
    assert.deepEqual(rows("+1.18 22 219.96M 147.38M 13 2468-1.5-1-0.500.511.5"), [1.18]);
    assert.deepEqual(
      rows("+M1 239 119.3K 0:04 9.45M 0 +M1 96 432.0K 0:23 5.61M 23.8K 20406080100"),
      [1, 1]
    );
    assert.deepEqual(
      rows("Eval Depth Nodes Time Speed TB Hits 0.00 33 3.57B 2:33 152.27M 5.0K -0.00 32 1.37B 2:43 148.92M 9"),
      [0, -0]
    );
    assert.deepEqual(rows(""), []);
    assert.deepEqual(rows(null), []);
  });

  test("inferAdjudication: draw when both evals are small, wins only with a known sign", () => {
    assert.equal(R.inferAdjudication([reading(0.01), reading(0)]), "draw");
    assert.equal(R.inferAdjudication([reading(0.25), reading(0.25)]), "draw");
    assert.equal(R.inferAdjudication([reading(0.01), reading(0.3)]), null);
    assert.equal(R.inferAdjudication([reading(1000, true), reading(1000, true)]), null);
    assert.equal(R.inferAdjudication([reading(0.01)]), null);
    assert.equal(R.inferAdjudication([reading(0.01), null]), null);
    // unknown sign (the page's convention): big evals are not a win
    assert.equal(R.inferAdjudication([reading(8), reading(9)]), null);
    assert.equal(R.inferAdjudication([reading(6, false, 6), reading(7, false, 7)]), "white");
    assert.equal(R.inferAdjudication([reading(6, false, -6), reading(1000, true, -1000)]), "black");
    assert.equal(R.inferAdjudication([reading(6, false, 6), reading(7, false, -7)]), null);
  });
});

describe("GameEndRules: clocks and stats", () => {
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

  test("statsSignature drops the headers and whitespace, null when not shown", () => {
    const text =
      "Eval Depth Nodes Time Speed TB Hits\n+1.01 25 537.49M 2:08 171.28M 60\n+0.80  36 1.02B 2:20 155.30M 245";
    assert.equal(
      R.statsSignature(text),
      "+1.01 25 537.49M 2:08 171.28M 60 +0.80 36 1.02B 2:20 155.30M 245"
    );
    assert.equal(R.statsSignature(text.replace(/\n/g, " ")), R.statsSignature(text));
    assert.notEqual(R.statsSignature(text), R.statsSignature(text.replace("1.02B", "1.43B")));
    assert.equal(R.statsSignature("Eval Depth Nodes Time Speed TB Hits"), null);
    assert.equal(R.statsSignature(""), null);
    assert.equal(R.statsSignature(null), null);
  });

  test("classifyGameOver: engines active, frozen, flag, adjudication, wrong clock", () => {
    const over = (input) => plain(R.classifyGameOver(input));

    // stats frozen STALL_MS, clock unknown
    assert.equal(over({ now: 7999, lastMoveAt: 0, statsChangedAt: 0, flagAt: null }).over, false);
    assert.equal(over({ now: 8000, lastMoveAt: 0, statsChangedAt: 0, flagAt: null }).end, "adjudication");
    // nothing known
    assert.equal(over({ now: 99_999, lastMoveAt: 0, statsChangedAt: null, flagAt: null }).over, false);
    // engines stopped at the move, the side to move had 2.1 s
    assert.equal(over({ now: 3999, lastMoveAt: 0, statsChangedAt: 400, flagAt: 2500 }).over, false);
    assert.deepEqual(
      (({ over: o, by, end }) => ({ o, by, end }))(
        over({ now: 4000, lastMoveAt: 0, statsChangedAt: 400, flagAt: 2500 })
      ),
      { o: true, by: "clock", end: "adjudication" }
    );
    // the engine printed 300 ms before its clock ran out
    assert.equal(over({ now: 4100, lastMoveAt: 0, statsChangedAt: 2200, flagAt: 2500 }).end, "time-forfeit");
    // stopped 1.2 s before: can't tell
    assert.equal(over({ now: 4100, lastMoveAt: 0, statsChangedAt: 1300, flagAt: 2500 }).end, "unclear");
    // the engine still prints well after its flag time: the clock reading was wrong
    assert.equal(over({ now: 4600, lastMoveAt: 0, statsChangedAt: 4100, flagAt: 2500 }).over, false);
    // clock ran out, stats not shown
    assert.equal(over({ now: 5000, lastMoveAt: 0, statsChangedAt: null, flagAt: 2000 }).end, "unclear");
  });

  test("isEventEndSuspected needs a long pause and idle engines", () => {
    assert.equal(R.isEventEndSuspected({ now: 44_999, lastMoveAt: 0, statsChangedAt: null }), false);
    assert.equal(R.isEventEndSuspected({ now: 45_000, lastMoveAt: 0, statsChangedAt: null }), true);
    assert.equal(R.isEventEndSuspected({ now: 50_000, lastMoveAt: 0, statsChangedAt: 45_000 }), false);
    assert.equal(R.isEventEndSuspected({ now: 53_000, lastMoveAt: 0, statsChangedAt: 45_000 }), true);
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
    {
      todo:
        "bug: event-end mode scans the last 3 finished rows, so the pair game two rows up " +
        "(same engines, same colors) is taken when the watched row has no result yet",
    },
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
    {
      todo:
        "bug: after a refuted result the same detector toasts again on the next quiet " +
        "position (a tablebase draw CCC does not adjudicate toasts after every move)",
    },
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

  test("drawn 6-man position in a real CCC game: one certain toast a second after the move", async () => {
    const world = createWorld();
    world.tablebase = () => "draw";

    await playArchivedGame(world, TABLEBASE_GAME);
    const lastMoveAt = world.t;
    await world.advance(3000);

    // asked once: the only position with 6 pieces or less
    assert.equal(world.fetches.length, 1);
    assert.equal(R.countPieces(world.fetches[0].fen), 6);
    assert.deepEqual(toastSummary(world), [
      { outcome: "draw", white: "Torch", black: "Reckless", reason: "Tablebase draw · 50 moves" },
    ]);
    // counted from the first moves table change of the last burst: the
    // previous move came 100 ms before this one
    const delay = world.toasts[0].t - lastMoveAt;
    assert.ok(
      delay >= C.TABLEBASE_CONFIRM_MS - C.SETTLE_DELAY_MS && delay <= C.TABLEBASE_CONFIRM_MS + 600,
      `${delay} ms`
    );

    // certain: the schedule is not needed when the next game starts
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
    await live.think(1500);
    live.move(AFTER_TABLEBASE_DRAW[0]);
    await live.think(2000);
    live.move(AFTER_TABLEBASE_DRAW[1]);
    await world.advance(5000);

    assert.equal(world.fetches[0].fen, finalFen);
    assert.ok(world.fetches.length >= 2);
    assert.equal(world.toasts.length, 0);
    assertNoErrors(world);
  });

  test("a draw answered at once is ignored if a move follows within a second", async () => {
    const world = createWorld();
    world.tablebase = (fen) => (R.countPieces(fen) === 6 ? "draw" : "win");

    const { live } = await playArchivedGame(world, TABLEBASE_GAME);
    await world.advance(600);
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

  test(
    "a drawn position CCC does not adjudicate is reported once, not after every move",
    {
      todo:
        "bug: GameEndArbiter.decide shows any result after a refuted one, so the " +
        "tablebase detector toasts again after each quiet move",
    },
    async () => {
      const world = createWorld();
      world.tablebase = () => "draw";

      const { live } = await playArchivedGame(world, TABLEBASE_GAME);
      for (const san of AFTER_TABLEBASE_DRAW) {
        await live.think(1500);
        live.move(san);
      }
      await world.advance(3000);

      assert.equal(world.toasts.length, 1);
    }
  );
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
    {
      todo:
        "bug: eventEndChecks / nextEventEndCheckAt are never reset on a new move; with " +
        "the stats hidden every think over 45 s uses a check (and opens the schedule tab)",
    },
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
    {
      todo:
        "bug: a tick between the table mutation and the settle timer caches the next " +
        "game's engine names (colors swapped) into the ended session, so the schedule " +
        "row is rejected (GameEndWatcher.onTick -> cacheEngineNames)",
    },
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
    {
      todo:
        "robustness: captureGameNumber takes the in-progress row without checking the " +
        "engines, so if the schedule switches first the watched game looks still in progress",
    },
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
