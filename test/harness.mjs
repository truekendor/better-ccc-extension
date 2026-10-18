/**
 * Test harness for the live game end detection.
 *
 * Loads the compiled content scripts (run `tsc` first) into a node:vm
 * context with a small fake of the CCC page and virtual time:
 * - timers (setTimeout / setInterval / Date) only move with `world.advance`
 * - the page model (`world.page`) renders the moves table, the engine
 *   panels (eval spans, result colors), the engine stats (`#graph-valuebar`
 *   boxes), the moves table result box, the schedule tab and the tab buttons
 * - `world.socketResult` / `world.socketGameUpdate` post the window
 *   messages inject/index.js forwards from the CCC websocket
 * - `fetch` (lichess tablebase) is answered by `world.tablebase`
 * - every `GameResultToast.notify` call is recorded in `world.toasts`
 *
 * Set GAMEEND_DEBUG=1 to see the detectors' debug log.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const SRC_DIR = path.resolve(here, "../src");
export const FIXTURES_DIR = path.join(here, "fixtures");

const DEBUG = process.env.GAMEEND_DEBUG === "1";

/** compiled scripts used by the game end detection, in manifest order */
export const SCRIPTS = [
  "chess-js.js",
  "helpers/utils.js",
  "helpers/extractPageData.js",
  "gameEnd/gameEndLogic.js",
  "gameEnd/gameEndPage.js",
  "gameEnd/gameEndDetectors.js",
  "gameEnd/gameEndWatcher.js",
  "gameResultToast.js",
];

const scriptCache = new Map();

function readScript(file) {
  if (!scriptCache.has(file)) {
    const fullPath = path.join(SRC_DIR, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`${fullPath} is missing: run tsc first`);
    }
    scriptCache.set(file, new vm.Script(fs.readFileSync(fullPath, "utf8"), { filename: file }));
  }
  return scriptCache.get(file);
}

/** objects made in the vm context have other prototypes: compare plain copies */
export function plain(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

/** the pure part only (gameEndLogic.js), no page needed */
export function loadLogic() {
  const ctx = vm.createContext({ console });
  readScript("gameEnd/gameEndLogic.js").runInContext(ctx);
  return vm.runInContext(
    "({ GameEndRules, GameEndArbiter, GameEndConfig })",
    ctx
  );
}

// * =========================
// * virtual time

class VirtualTime {
  constructor(start) {
    this.now = start;
    this.timers = new Map();
    this.nextId = 1;
    /**
     * hidden tab throttling: timers only fire on multiples of this
     * (1000 ms in a background tab, 60 000 ms with intensive throttling)
     */
    this.alignMs = 0;
  }

  /** when a timer due at `at` really fires */
  firesAt(at) {
    return this.alignMs ? Math.ceil(at / this.alignMs) * this.alignMs : at;
  }

  setTimeout(fn, ms = 0, ...args) {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + Math.max(0, ms || 0), fn, args, every: null });
    return id;
  }

  setInterval(fn, ms = 0, ...args) {
    const id = this.nextId++;
    const every = Math.max(1, ms || 0);
    this.timers.set(id, { at: this.now + every, fn, args, every });
    return id;
  }

  clear(id) {
    this.timers.delete(id);
  }

  /** the earliest timer firing at or before `target` (ties: oldest first) */
  nextDue(target) {
    let found = null;
    for (const [id, timer] of this.timers) {
      const at = this.firesAt(timer.at);
      if (at <= target && (!found || at < found.at)) {
        found = { id, timer, at };
      }
    }
    return found;
  }
}

/** lets promise chains (fetch, sleeps that just resolved...) run */
async function flushMicrotasks() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// * =========================
// * fake DOM pieces

class FakeClassList {
  constructor(names = []) {
    this.names = new Set(names);
  }
  add(...names) {
    names.forEach((name) => this.names.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }
  contains(name) {
    return this.names.has(name);
  }
  toggle(name, force) {
    const on = force ?? !this.names.has(name);
    if (on) this.names.add(name);
    else this.names.delete(name);
    return on;
  }
}

/** element made by document.createElement (the toast) */
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = {};
    this.ownText = "";
    const props = {};
    this.style = { props, setProperty: (key, value) => (props[key] = value) };
  }
  get textContent() {
    return this.children.length
      ? this.children.map((child) => child.textContent).join("")
      : this.ownText;
  }
  set textContent(value) {
    this.children = [];
    this.ownText = String(value);
  }
  get innerText() {
    return this.textContent;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    node.parentNode = null;
    return node;
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }
  getAttribute(key) {
    return this.attributes[key] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

/** read-only element generated from the page model on every query */
function staticElement(props = {}) {
  return {
    tagName: "DIV",
    children: [],
    classList: new FakeClassList(props.classes),
    textContent: "",
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    ...props,
  };
}

const TAB_NAMES = ["vote", "standings", "schedule", "match", "info"];

// * =========================
// * the page model

/**
 * what CCC shows. Clocks: `base` seconds left, counting down while
 * `runningSince` is set; the display keeps the value for a second, then
 * drops one second per second ("0:02.11", "0:01.11", ..., "" at 0).
 */
export class FakePage {
  constructor(time) {
    this.time = time;
    /** SAN moves in the moves table */
    this.pgn = [];
    this.hash = "";
    this.hidden = false;
    /** engine panels and stats boxes rendered (middle "Engines" tab) */
    this.enginesTab = true;
    this.names = { white: "Torch", black: "Reckless" };
    this.ranks = { white: "#1", black: "#2" };
    this.evals = { white: "+ 0.10", black: "+ 0.05" };
    this.clocks = {
      white: { base: 180, runningSince: null },
      black: { base: 180, runningSince: null },
    };
    /** raw panel texts ("Torch #1 + 0.80 2:13") overriding the model */
    this.panelText = null;
    /** recorded stats text: each change of it changes both stats boxes */
    this.statsOverride = null;
    /** search lines printed by each engine (`#graph-valuebar` boxes) */
    this.boxCounters = { white: 0, black: 0 };
    /** `.movetable-gameResult` box: { classes: [...], text } or null */
    this.resultBox = null;
    /** panel result colors: { white: "enginedata-win", black: "enginedata-loss" } */
    this.panelResult = null;
    /** schedule rows: { n, white, black, score, inProgress } */
    this.schedule = [];
    this.selectedTab = "standings";
    /** no tab buttons at all (some layouts) */
    this.noTabButtons = false;
    this.tabClicks = [];
  }

  clockSeconds(color) {
    const clock = this.clocks[color];
    if (clock.runningSince === null) {
      return clock.base;
    }
    const elapsed = Math.floor((this.time.now - clock.runningSince) / 1000);
    return clock.base - elapsed;
  }

  clockText(color) {
    if (this.panelText) {
      return this.panelText[color].match(/(\d+:\d{2}(?:\.\d+)?)\s*$/)?.[1] ?? "";
    }
    const value = Math.round(this.clockSeconds(color) * 100) / 100;
    if (value <= 0) return "";
    if (value >= 60) {
      const minutes = Math.floor(value / 60);
      return `${minutes}:${String(Math.floor(value - minutes * 60)).padStart(2, "0")}`;
    }
    if (value >= 6) return `0:${String(Math.floor(value)).padStart(2, "0")}`;
    return `0:0${value.toFixed(2)}`;
  }

  panelContainerText(color) {
    if (this.panelText) {
      return this.panelText[color];
    }
    return [this.names[color], this.ranks[color], this.evals[color], this.clockText(color)]
      .filter(Boolean)
      .join(" ");
  }

  engineName(color) {
    if (this.panelText) {
      return this.panelText[color].split(" ")[0];
    }
    return this.names[color];
  }

  /** the engine to move printed a new search line */
  engineOutput() {
    this.boxCounters[this.pgn.length % 2 === 0 ? "white" : "black"] += 1;
  }

  /** eval as the engine panel / stats box shows it, without spaces */
  evalText(color) {
    if (this.panelText) {
      // "Torch #1 + 0.80 2:13": the token after the rank, if it is an eval
      const afterRank = this.panelText[color].match(/#\d+\s+(.*)$/)?.[1] ?? "";
      const first = afterRank.replace(/^([+-])\s+(?=\d)/, "$1").split(/\s+/)[0] ?? "";
      return /^[+-]?(M\d+|\d+\.\d+)$/.test(first) ? first : "";
    }
    return (this.evals[color] ?? "").replace(/\s+/g, "");
  }

  /** the six spans of a `#graph-valuebar` box: Eval Depth Nodes Time Speed TB Hits */
  valueBoxSpans(color) {
    // a recording: every change of the stats text changes both boxes
    const n =
      this.statsOverride !== null
        ? Array.from(this.statsOverride).reduce((sum, ch, i) => (sum + ch.charCodeAt(0) * (i + 1)) % 1e9, 0)
        : this.boxCounters[color];
    return [this.evalText(color), String(20 + (n % 30)), `${100 + n}.00M`, "0:02", "300.00M", String(n)];
  }

  selectTab(name) {
    this.selectedTab = name;
    this.tabClicks.push({ at: this.time.now, name });
  }

  get scheduleOpen() {
    return this.selectedTab === "schedule";
  }
}

function panelElement(page, color) {
  return staticElement({
    querySelector: (selector) => {
      switch (selector) {
        case ".enginedata-clock":
          return staticElement({ textContent: page.clockText(color) });
        case "#enginedata-rightOfImage > span":
          return staticElement({ textContent: page.engineName(color) });
        case "#enginedata-eval": {
          // <span>{sign}</span> <span>{number}</span>, a mate in the first span
          const value = page.evalText(color);
          const [, sign = "", number = ""] = value.match(/^([+-]?M?)(.*)$/) ?? [];
          const span = (text) => ({ tagName: "SPAN", textContent: text });
          return staticElement({
            children: value.includes("M") ? [span(value), span("")] : [span(sign), span(number)],
            textContent: value,
          });
        }
        case ".enginedata-container": {
          const text = page.panelContainerText(color);
          return staticElement({
            classes: ["enginedata-container", ...(page.panelResult ? [page.panelResult[color]] : [])],
            innerText: text,
            textContent: text.replace(/\s+/g, ""),
            getAttribute: (key) =>
              key === "title" ? `${page.ranks[color]} ${page.engineName(color)}` : null,
          });
        }
        default:
          return null;
      }
    },
  });
}

function scheduleRowElement(row) {
  const div = (text) => ({ tagName: "DIV", textContent: text });
  const img = { tagName: "IMG", textContent: "" };
  return staticElement({
    classes: ["schedule-game-link", ...(row.inProgress ? ["schedule-in-progress"] : [])],
    children: [
      div(String(row.n)),
      img,
      div(`#1 ${row.white}`),
      div(row.score ?? (row.inProgress ? "In Progress..." : "")),
      div(`#2 ${row.black}`),
      img,
    ],
  });
}

// * =========================
// * the world: page + scripts + time

/**
 * `start` defaults to a multiple of the 500 ms tick, so the watcher's ticks
 * happen at whole half seconds of `world.t`
 */
export function createWorld({ start = 1_800_000_000_000 } = {}) {
  const time = new VirtualTime(start);
  const page = new FakePage(time);
  const toasts = [];
  const errors = [];
  const fetches = [];
  const listeners = {};
  const observers = [];

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(time.now);
      else super(...args);
    }
    static now() {
      return time.now;
    }
  }

  const timerApi = {
    setTimeout: (fn, ms, ...args) => time.setTimeout(fn, ms, ...args),
    setInterval: (fn, ms, ...args) => time.setInterval(fn, ms, ...args),
    clearTimeout: (id) => time.clear(id),
    clearInterval: (id) => time.clear(id),
  };

  const movesTable = {
    querySelectorAll: (selector) =>
      selector === "td" ? page.pgn.map((san) => ({ textContent: san })) : [],
  };

  const tabButtons = TAB_NAMES.map((name) => ({
    name,
    classList: {
      contains: (cls) => cls === "selection-panel-selected" && page.selectedTab === name,
    },
    click: () => page.selectTab(name),
  }));

  const body = new FakeElement("body");

  const document = {
    get hidden() {
      return page.hidden;
    },
    body,
    head: new FakeElement("head"),
    documentElement: new FakeElement("html"),
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => {
      if (!page.enginesTab) return null;
      if (id === "white-player") return panelElement(page, "white");
      if (id === "black-player") return panelElement(page, "black");
      return null;
    },
    querySelector: (selector) => {
      const box = selector.match(/^#graph-valuebar > \.(white|black)-box$/);
      if (box) {
        if (!page.enginesTab) return null;
        return staticElement({
          classes: [`${box[1]}-box`],
          children: page.valueBoxSpans(box[1]).map((text) => ({ tagName: "SPAN", textContent: text })),
        });
      }
      if (selector === ".schedule-container") {
        if (!page.scheduleOpen) return null;
        return staticElement({
          querySelectorAll: (sel) =>
            sel === ".schedule-game-link" ? page.schedule.map(scheduleRowElement) : [],
        });
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      observers.push({ target, observer: this });
    }
    disconnect() {
      for (let i = observers.length - 1; i >= 0; i--) {
        if (observers[i].observer === this) observers.splice(i, 1);
      }
    }
  }

  const window = {
    location: {
      get hash() {
        return page.hash;
      },
    },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener: () => {},
    dispatchEvent: () => true,
    ...timerApi,
  };

  /** lichess tablebase: fen -> category (or { category, delayMs, status }) */
  const world = {
    time,
    page,
    toasts,
    errors,
    fetches,
    tablebase: () => "unknown",
  };

  const fetch = (url) => {
    const fen = decodeURIComponent(String(url).split("fen=")[1] ?? "");
    fetches.push({ at: time.now, fen });

    let answer = world.tablebase(fen);
    if (typeof answer === "string" || answer === undefined) {
      answer = { category: answer };
    }
    const { category, delayMs = 50, status = 200, fail = false } = answer;

    return new Promise((resolve, reject) => {
      time.setTimeout(() => {
        if (fail) {
          reject(new TypeError("NetworkError when attempting to fetch resource."));
          return;
        }
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => ({ category }),
        });
      }, delayMs);
    });
  };

  const silentConsole = {
    log: (...args) => (DEBUG ? console.log(...args) : undefined),
    warn: (...args) => (DEBUG ? console.warn(...args) : undefined),
    error: (...args) => console.error(...args),
    info: () => {},
    debug: () => {},
  };

  const ctx = vm.createContext({
    console: silentConsole,
    Date: FakeDate,
    ...timerApi,
    queueMicrotask,
    window,
    document,
    MutationObserver: FakeMutationObserver,
    localStorage: {
      getItem: (key) => (DEBUG && key === "better-ccc-debug-gameend" ? "1" : null),
      setItem: () => {},
    },
    fetch,
    _DOM_Store: {
      get movesTable() {
        return movesTable;
      },
      movesTableContainer: {
        // the toast looks for the board next to it
        closest: () => null,
        querySelector: (selector) =>
          selector === ".movetable-gameResult" && page.resultBox
            ? staticElement({
                classes: page.resultBox.classes,
                textContent: page.resultBox.text,
              })
            : null,
      },
      get tabButtons() {
        return page.noTabButtons ? [] : tabButtons;
      },
      get scheduleBtn() {
        return page.noTabButtons ? undefined : tabButtons[2];
      },
    },
    _State: { eventId: "514" },
    UserSettings: {
      customSettings: { showResultToast: true, playGameEndSound: false },
    },
  });

  let started = false;

  // getters: Object.assign would copy their current value
  Object.defineProperties(world, {
    started: { get: () => started },
    /** virtual ms since the world was created */
    t: { get: () => time.now - start },
  });

  Object.assign(world, {
    ctx,

    /** loads the scripts: GameEndWatcher.init() runs from gameResultToast.js */
    start() {
      if (started) throw new Error("already started");
      started = true;
      for (const file of SCRIPTS) {
        readScript(file).runInContext(ctx);
      }
      vm.runInContext(
        `(() => {
          const notify = GameResultToast.notify.bind(GameResultToast);
          GameResultToast.notify = (info) => { __recordToast(info); notify(info); };
          Utils.logError = (e) => { __recordError(e); };
        })()`,
        Object.assign(ctx, {
          __recordToast: (info) => toasts.push({ at: time.now, t: time.now - start, ...plain(info) }),
          __recordError: (e) => errors.push(e),
        })
      );
      return world;
    },

    /** runs `code` in the extension's global scope */
    eval(code) {
      return vm.runInContext(code, ctx);
    },

    /** runs the timers due in the next `ms` (virtual), in order */
    async advance(ms) {
      const target = time.now + ms;
      await flushMicrotasks();
      for (;;) {
        const due = time.nextDue(target);
        if (!due) break;
        const { id, timer, at } = due;
        time.now = Math.max(time.now, at);
        // a throttled interval fires once per slot, then counts from there
        if (timer.every) timer.at = time.now + timer.every;
        else time.timers.delete(id);
        timer.fn(...timer.args);
        await flushMicrotasks();
      }
      time.now = target;
      await flushMicrotasks();
    },

    /** advances in `step` ms slices, calling `each` before every slice */
    async advanceWith(ms, step, each) {
      for (let done = 0; done < ms; done += step) {
        each?.();
        await world.advance(Math.min(step, ms - done));
      }
    },

    /** the moves table changed (the observers get one mutation record) */
    mutate() {
      for (const { observer } of observers.slice()) {
        observer.callback([{ type: "childList" }], observer);
      }
    },

    /** a message posted by inject/index.js (page world) */
    pageMessage(type, payload, { source = "better-ccc-page", fromWindow = true } = {}) {
      const event = {
        type: "message",
        source: fromWindow ? window : {},
        data: { source, type, json: JSON.stringify(payload) },
      };
      for (const fn of listeners.message ?? []) fn(event);
    },

    /** CCC's websocket `result` for the live game */
    socketResult({ whiteName = page.names.white, blackName = page.names.black, score, reason }) {
      world.pageMessage("result", { whiteName, blackName, score, reason });
    },

    /** CCC's websocket `gameUpdate` (summarized like inject/index.js does) */
    socketGameUpdate({ gameNr, live = false, termination = "", outcome = "", white = "", black = "", plyCount = null }) {
      world.pageMessage("gameUpdate", { gameNr, live, termination, outcome, white, black, plyCount });
    },

    setHash(hash) {
      page.hash = hash;
      for (const fn of listeners.hashchange ?? []) fn({ type: "hashchange" });
    },

    /** toast elements currently in the page */
    toastElements() {
      return body.children.filter((el) => el.classList.contains("ccc-result-toast"));
    },
  });

  return world;
}

// * =========================
// * driving a live game

const other = (color) => (color === "white" ? "black" : "white");

/** a schedule row: `score` "1-0 \n 62 Moves", null while in progress */
export function scheduleRow(n, white, black, score = null) {
  return { n: String(n), white, black, score: score ?? "In Progress...", inProgress: score === null };
}

/**
 * plays a live game on `world.page` like CCC does: a move switches the
 * clocks and changes the moves table, the engine to move prints search
 * lines while it thinks, everything freezes (but the clocks) at the end
 */
export class LiveGame {
  constructor(world, { book = [], increment = 2 } = {}) {
    this.world = world;
    this.page = world.page;
    this.increment = increment;
    this.page.pgn = book.slice();
    this.page.clocks[this.sideToMove].runningSince = world.time.now;
  }

  get sideToMove() {
    return this.page.pgn.length % 2 === 0 ? "white" : "black";
  }

  /** the engine to move searches for `ms`, printing every `everyMs` (0: silent) */
  async think(ms, { everyMs = 1000 } = {}) {
    let done = 0;
    while (done < ms) {
      const step = everyMs ? Math.min(everyMs, ms - done) : ms - done;
      if (everyMs) this.page.engineOutput();
      await this.world.advance(step);
      done += step;
    }
  }

  /**
   * the move arrives: `left` = mover's time left (increment included),
   * `toMoveLeft` = time of the side to move, `evalText` = mover's panel eval
   */
  move(san, { left, toMoveLeft, evalText } = {}) {
    const { page, world } = this;
    const mover = this.sideToMove;
    const clock = page.clocks[mover];

    if (left !== undefined) {
      clock.base = left;
    } else {
      const elapsed =
        clock.runningSince === null ? 0 : (world.time.now - clock.runningSince) / 1000;
      clock.base = Math.round((Math.max(0, clock.base - elapsed) + this.increment) * 1000) / 1000;
    }
    clock.runningSince = null;

    const next = page.clocks[other(mover)];
    next.runningSince = world.time.now;
    if (toMoveLeft !== undefined) next.base = toMoveLeft;

    if (evalText !== undefined) page.evals[mover] = evalText;

    page.pgn = [...page.pgn, san];
    page.engineOutput();
    world.mutate();
  }

  /** each move after `thinkMs` of engine output */
  async playMoves(sans, { thinkMs = 2000, everyMs = 1000, ...moveOptions } = {}) {
    for (const san of sans) {
      await this.think(thinkMs, { everyMs });
      this.move(san, moveOptions);
    }
  }

  /**
   * CCC shows the next game: same <table> with its book moves, engine
   * panels and stats of the new game (colors swapped in a game pair)
   */
  replaceWithNextGame(book, { swapColors = true, schedule } = {}) {
    const { page, world } = this;

    if (swapColors) {
      page.names = { white: page.names.black, black: page.names.white };
      page.ranks = { white: page.ranks.black, black: page.ranks.white };
    }
    page.evals = { white: "+ 1.18", black: "" };
    page.clocks = {
      white: { base: 182, runningSince: world.time.now },
      black: { base: 182, runningSince: null },
    };
    if (schedule) {
      page.schedule = schedule;
    }
    page.pgn = book.slice();
    page.engineOutput();
    world.mutate();
  }
}

/** eval as an engine panel shows it: "+ 0.56", "- 0.75", "+M3", "-M2" */
export function panelEval(score) {
  if (score === null || score === undefined) return "";
  if (/M/.test(score)) return score.startsWith("-") ? score : `+${score.replace(/^\+/, "")}`;
  const value = parseFloat(score);
  return `${value < 0 ? "-" : "+"} ${Math.abs(value).toFixed(2)}`;
}

/**
 * plays an archived game (fixtures/ccc-games.json) from its book: real
 * think times, clocks and evals; the engines print every second
 */
export async function playArchivedGame(world, game, { upTo = game.plies.length } = {}) {
  const bookLength = game.plies.findIndex((ply) => ply[1] !== null);
  const book = game.plies.slice(0, bookLength).map((ply) => ply[0]);

  world.page.names = { white: game.white, black: game.black };
  const live = new LiveGame(world, { book });
  if (world.started) {
    world.mutate();
  } else {
    world.start();
  }

  for (const [san, score, secs, left] of game.plies.slice(bookLength, upTo)) {
    // the clock display only has a resolution of a second: round the think
    // time to the 100 ms the harness moves time by
    await live.think(Math.max(100, Math.round(secs * 10) * 100));
    live.move(san, { left, evalText: panelEval(score) });
  }

  return { live, book };
}

// * =========================
// * replaying a recorded live game

/** monitor recording: one sample every ~0.5 s (first line: page notes) */
export function parseMonitor(text) {
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line))
    .map((sample) => ({ ...sample, t: parseFloat(sample.t) }));
}

/**
 * replays recorded samples on the page: panels, stats text and the moves
 * table (`pgnFor(plies, sample)` gives the moves). Virtual time follows
 * the recording; `onSample` runs before each sample is applied
 */
export async function replayMonitor(world, samples, { pgnFor, onSample, until = Infinity } = {}) {
  const startT = samples[0].t;
  let plies = null;

  const apply = (sample) => {
    world.page.panelText = { white: sample.w, black: sample.b };
    world.page.statsOverride = `Eval Depth Nodes Time Speed TB Hits ${sample.stats}`;
    if (sample.plies !== plies) {
      plies = sample.plies;
      world.page.pgn = pgnFor(sample.plies, sample);
      return true;
    }
    return false;
  };

  apply(samples[0]);
  world.start();

  for (let i = 1; i < samples.length && samples[i].t <= until; i++) {
    const sample = samples[i];
    const dueAt = Math.round((sample.t - startT) * 1000);
    await world.advance(dueAt - world.t);
    onSample?.(sample);
    if (apply(sample)) {
      world.mutate();
    }
  }
}
