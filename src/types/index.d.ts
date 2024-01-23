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

// https://stackoverflow.com/questions/57798098/exclude-empty-object-from-partial-type
type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> &
  U[keyof U];

type EmptyObject = Record<string, never>;

type Prettify<T> = {
  [Key in keyof T]: T[Key];
} & unknown;

// https://youtu.be/a_m7jxrTlaw?list=PLIvujZeVDLMx040-j1W4WFs1BxuTGdI_b
type LooseAutocomplete<T extends string> = T | Omit<string, T>;

// * ===================
// * content scripts types
type ResultAsScore = 1 | 0 | -1;
type WDL = [number, number, number];
type PTNML = [number, number, number, number, number];

type Browsers = typeof chrome | typeof browser;
type Tab = chrome.tabs.Tab | browser.tabs.Tab;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace state_types {
  export type UserSettings = {
    ptnml: boolean;
    elo: boolean;
    pairsPerRow: number | "";
    pairsPerRowDuel: number | "";
    allowKeyboardShortcuts: boolean;
    // todo
    pgnFetch: boolean;
    agreementHighlight: boolean;
    addLinksToGameSchedule: boolean;
    replaceClockSvg: boolean;
    displayEngineNames: boolean;
    materialCount: boolean;
    // todo rename
    drawnPairNeutralColorWL: boolean;
    // todo
    // calcAdditionalStats: boolean
    // visualSettings: _dev_VisualSettings
  };

  type _dev_VisualSettings = {
    doubleLossBgColor: string;
    doubleLossFontColor: string;
    doubleWinBgColor: string;
    doubleWinFontColor: string;
    winBgColor: string;
    winFontColor: string;
    lossBgColor: string;
    lossFontColor: string;
  };
}

type BooleanUserOptions = Partial<OnlyBoolean<state_types.UserSettings>>;

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
// * chess state types

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace CustomChess {
  export type GameData = {
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

  export type GameDataFields = {
    pgn: readonly string[] | null;
    FenHistoryFull: readonly string[];
    FenHistoryTrimmed: readonly string[];

    lastTrimmed: string | null;
    lastFull: string | null;

    gameNumber: number | null;
  };

  export type GameDataActions = {
    clearFenHistory: () => void;
    resetPGN: () => void;
    getFullFenAtIndex: (index: number) => string | null;
    getTrimFenAtIndex: (index: number) => string | null;

    setPGN: (pgn: string[]) => void;
  };

  export type TranspositionObject = {
    currentPly: number;
    reversePly: number;
    fen: string;
  };
}
