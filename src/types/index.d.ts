// * ===================
// * utility types
// prettier-ignore
type BooleanKeys<T> = { [k in keyof T]: T[k] extends boolean ? k : never}[keyof T];
type OnlyBoolean<T> = { [k in BooleanKeys<T>]: boolean };
type ValuesOf<T> = T[keyof T];

type HTMLGenericNode = Element | HTMLElement | ParentNode | ChildNode;

// slightly modified version of
// https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist
type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> &
      Partial<Record<Exclude<Keys, K>, never>>;
  }[Keys];

type EmptyObject = Record<string, never>;

type Prettify<T> = {
  [Key in keyof T]: T[Key];
} & {};

// https://youtu.be/a_m7jxrTlaw?list=PLIvujZeVDLMx040-j1W4WFs1BxuTGdI_b
type LooseAutocomplete<T extends string> = T | Omit<string, T>;

// * ===================
// * content scripts types
type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];
type PTNML = [number, number, number, number, number];

type Browsers = typeof chrome | typeof browser;
type Tab = chrome.tabs.Tab | browser.tabs.Tab;

type UserSettings = {
  ptnml: boolean;
  elo: boolean;
  pairPerRow: number | "";
  pairsPerRowDuel: number | "";
  allowKeyboardShortcuts: boolean;
  // todo
  pgnFetch: boolean;
  agreementHighlight: boolean;
  addLinksToGameSchedule: boolean;
  replaceClockSvg: boolean;
  displayEngineNames: boolean;
  materialCount: boolean;
};

type BooleanUserOptions = Partial<OnlyBoolean<UserSettings>>;

type AdditionalStats = {
  longestLossless: number;
  longestWinStreak: number;
  longestWinless: number;
  pairsRatio: number;
  performancePercent: number;
  highestScore: number;
  pairsWL: [number, number];
};

// * ===================
// * svg types
type SVGColors = LooseAutocomplete<"black" | "white" | "none" | "#CBCACA">;

type SVGOption = {
  d: string;
  id: string;
  width: string;
  height: string;
  viewBox: string;
  fill: SVGColors;
  stroke: SVGColors;
  fillRule: "nonzero" | "evenodd";
  clipRule: "nonzero" | "evenodd";
  strokeWidth: string;
  strokeLinecap: "butt" | "round" | "square";
  strokeLinejoin: "butt" | "round" | "square";
};

type ChessPieceUpper = "P" | "B" | "N" | "R" | "Q" | "K";
type ChessPieceLower = "p" | "b" | "n" | "r" | "q" | "k";
type ChessPieces = Prettify<ChessPieceUpper | ChessPieceLower>;

// * ===================
// * state types
type ChessGameData = {
  /**
   * todo add description
   */
  FenHistoryFull: string[];
  /**
   * todo add description
   */
  FenHistoryTrimmed: string[];
  /**
   * todo add description
   */
  pgn: string[] | null;
};

type PageData = {
  currentGame: number | null;
  totalGames: number | null;
  active: boolean;
};

type TabData = {
  event: string | null;
  game: number | null;
};

type GameDataFields = {
  historyFullLen: number;
  historyTrimmedLen: number;

  pgn: string[] | null;
  FENHistoryFull: string[];
  FENhistoryTrimmed: string[];

  lastTrimmed: string | null;
  lastFull: string | null;
};

type GameDataActions = {
  clearHistory: () => void;

  addToFull: (fen: string) => void;
  addToTrimmed: (fen: string) => void;

  getFullFenAtIndex: (index: number) => string | null;
  getTrimFenAtIndex: (index: number) => string | null;

  setPGN: (pgn: string[]) => void;
};

type TTEntry = {
  currentPly: number;
  reversePly: number;
  fen: string;
};
