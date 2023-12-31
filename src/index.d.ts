// prettier-ignore
type BooleanKeys<T> = { [k in keyof T]: T[k] extends boolean ? k : never}[keyof T];
type OnlyBoolean<T> = { [k in BooleanKeys<T>]: boolean };

type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];
type PTNML = [number, number, number, number, number];
type LabelForField = keyof Omit<UserOptions, "pairPerRow">;

type TChrome = typeof chrome;
type TFirefox = typeof browser;
type Browsers = TChrome | TFirefox;
type Tab = chrome.tabs.Tab | browser.tabs.Tab;

type ValuesOfObject<T> = T[keyof T];

type UserOptions = {
  ptnml: boolean;
  elo: boolean;
  pairPerRow: number | undefined;
  drawBgOnEmptyCells: boolean;
  allowKeyboardShortcuts: boolean;
  agreementHighlight: boolean;
  pgnFetch: boolean;
  addLinksToGameSchedule: boolean;
};

type BooleanUserOptions = Partial<OnlyBoolean<UserOptions>>;

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
type RuntimeMessageType =
  | "get_pgn"
  | "onload"
  | "response_pgn"
  | "toggle_option"
  | "event_name";

type RuntimeMessagePayload = {
  gameNumber: number | null;
  pgn: string[];
  optionToToggle: keyof Partial<OnlyBoolean<UserOptions>>;
  eventName: string | null;
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
