// prettier-ignore
type BooleanKeys<T> = { [k in keyof T]: T[k] extends boolean ? k : never}[keyof T];
type OnlyBoolean<T> = { [k in BooleanKeys<T>]: boolean };

type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];
type PTNML = [number, number, number, number, number];
type LabelForField = keyof Omit<Options, "pairPerRow">;

type TChrome = typeof chrome;
type TFirefox = typeof browser;
type Browsers = TChrome | TFirefox;
type Tab = chrome.tabs.Tab | browser.tabs.Tab;

type ValuesOfObject<T> = T[keyof T];

type Options = {
  ptnml: boolean;
  elo: boolean;
  pairPerRow: number | undefined;
  drawBgOnEmptyCells: boolean;
  allowHotkeys: boolean;
  agreementHighlight: boolean;
  pgnFetch: boolean;
};

type AdditionalStats = {
  longestLossless: number;
  longestWinStreak: number;
  longestWinless: number;
  pairsRatio: number;
  performancePercent: number;
  highestScore: number;
};

// * ===================
// * chess com response types

type ChessComGameResponse = {
  end: "checkmate" | "adjudication" | "3fold";
  res: "1/2-1/2" | "1-0" | "0-1";
  lastBookPly: number;
  pgn: string;
  info: InfoEntry[];
  kibitzerHistory: KibitzerEntry[];
} | null;

type KibitzerHistoryLog = {
  color: "white" | "black";
  ply: number;
  score: string;
  depth: string;
  nodes: string;
  speed: string;
  tbhits: string;
  pv: string;
};

type InfoHistoryLog = KibitzerHistoryLog & {
  timestamp: string;
  time: number;
};

type KibitzerEntry = KibitzerHistoryLog | null | {};

type InfoEntry =
  | {
      w?: KibitzerEntry;
      b?: KibitzerEntry;
      ply: number;
    }
  | null
  | {};

// * ===================
// * message passing types
type RuntimeMessageType = "get_pgn" | "onload" | "response_pgn";

type RuntimeMessagePayload = {
  gameNumber: number | null;
  pgn: string[];
} | null;

type RuntimeMessage = {
  type: RuntimeMessageType;
  payload: Partial<RuntimeMessagePayload>;
};

// * ===================
// * background.ts types
type EventListItem = {
  id: string;
  name: string;
};

type EventAndGame = {
  event: string;
  game: number;
};
