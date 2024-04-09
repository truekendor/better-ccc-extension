// * ===================
// * chess.com response types

declare namespace chess_com {
  // these are not forced
  /**
   * number `int` in string format
   */
  type NumericStringInt = `${number}`;
  /**
   * number `float` in string format
   */
  type NumericStringFloat = `${number}`;

  type game_result_as_score_first = "1/2-1/2" | "1-0" | "0-1";
  type game_result_as_score_second = "½" | "1" | "0";

  type MessageType =
    | "fullUpdate"
    | "liveInfo"
    | "kibitzerUpdate"
    | "clockUpdate"
    | "newMove";

  type game_end_reason =
    | "checkmate"
    | "adjudication"
    | "tb-adjudication"
    | "3fold"
    | "50moves"
    | "crash";

  export type game_response = {
    end: game_end_reason;
    res: game_result_as_score_first;
    lastBookPly: number;
    pgn: string;
    info: InfoEntry[];
    kibitzerHistory: kibitzer_entry[];
  } | null;

  // * ===================
  // * Full event response type
  // * like https://cccc.chess.com/archive?event=ccc21-rapid-semifinals
  // * also the wss:// response
  export type full_event_response = {
    type: "fullUpdate";
    pgn: string;
    info: InfoEntry[];
    kibitzerHistory: kibitzer_entry[];
    res: game_result_as_score_first;
    /**
     * string with event archive path like `archive/tournament-354909.pgn`
     */
    archivePath: string;
    rules: string;
    standings: standings;
    times: {
      w: number;
      b: number;
    };
    players: string[];
    end: game_end_reason;
    /**
     * string with current event id like `ccc21-rapid-semifinals`
     */
    eventSlug: string;
    lastBookPly: number;

    crosstable: crosstable;
    headToHead: head_to_head[];
    schedule: schedule_entry[];
    voteTotals: {
      white: number;
      black: number;
      draw: number;
    };

    engineinfo: EngineInfoEntry[];
    millisecondsLeftToVote: number | null;
    voteLeaderboard: VoteLeaderboardEntry[];
    voteAccuracyLeaderboard: VoteLeaderboardEntry[];
  } | null;

  type kibitzer_history_log = {
    color: "white" | "black";
    depth: NumericStringInt;
    nodes: NumericStringInt;
    ply: NumericStringInt;
    /** moves in UCI format
     * @example
     * "d1b3 d8b6 f3d2 f5g6 h2h4"
     */
    pv: string;
    /** `float` in string format
     * @example
     * "+0.77", "-1.22"
     */
    score: string;
    speed: NumericStringInt;
    tbhits: NumericStringInt;
  };

  type info_history_log = Prettify<
    kibitzer_history_log & {
      time: number;
      timestamp: NumericStringInt;
    }
  >;

  type kibitzer_entry = Prettify<kibitzer_history_log> | null | EmptyObject;

  type InfoEntry =
    | (RequireOnlyOne<{
        w: kibitzer_entry;
        b: kibitzer_entry;
      }> & { ply: number })
    | null
    | EmptyObject;

  type VoteLeaderboardEntry = {
    type: string;
    username: string;
    avatarUrl: string;
    score: number;
    voteCount: number;
    accuracy: number;
  };

  type EngineInfoEntry = {
    author: string | null;
    binary: unknown | null;
    country: string | null;
    dateupdated: NumericStringInt | null;
    description: string | null;
    edit: string | null;
    elo: NumericStringInt | null;
    "engine family": string | null;
    engineconfig: null;
    engineid: NumericStringInt;
    flag: string | null;
    hash: unknown | null;
    name: string | null;
    tb: string | null;
    threads: NumericStringInt | null;
    ucisettings: string | null;
    version: string | null;
    website: string | null;
    year: NumericStringInt | null;
  };

  type standings_entry = {
    authors: string | null;
    country: string | null;
    dateupdated: number;
    engineid: NumericStringInt;
    facts: string | null;
    flag: string;
    games: number;
    name: string;
    /** performance(%) `float` in string format
     * @example
     * perf: "50.5%"
     */
    perf: string;
    rank: number;
    rating: NumericStringInt;
    sb: NumericStringFloat;
    score: NumericStringFloat;
    ucisettings: [string | number, string | number][];
    version: string;
    website: string | null;
    year: NumericStringInt;
  };

  type standings = {
    standings: standings_entry[];
    gamesPlayed: number;
  };

  type crosstable = {
    [key: string]: {
      [key: string]: {
        results: {
          r: game_result_as_score_second;
          id: NumericStringInt;
        };
        p1Score: number;
        p2Score: number;
        margin: number;
      };
    };
  };

  type head_to_head = {
    /** player 1 */
    p1: string;
    /** player 1 name */
    p1Name: string;
    /** player 2*/
    p2: string;
    /** player 2 name */
    p2Name: string;
    p1Score: number;
    p2Score: number;
    games: game_entry[];
  };

  type game_entry = {
    id: NumericStringInt;
    colors: ["w" | "b", "w" | "b"];
    result: [game_result_as_score_second, game_result_as_score_second];
    opening: string;
    /** evals in format like "+-" / "--" */
    evals: [string, string];
    /** game duration in string format like "00:23:14" */
    duration: string;
    index: number;
  };

  type schedule_entry =
    | {
        id: NumericStringInt;
        p: [number, number];
        numMoves: number;
        res: game_result_as_score_first;
      }
    | {
        p: [number, number];
        startTime: number;
      }
    | {
        p: [number, number];
        inProgress: boolean;
      };

  /**
   * websocket response types
   */
  export namespace WS {
    export type FullUpdate = full_event_response;

    export type LiveInfo = {
      type: "liveInfo";
      info: info_history_log;
    };

    export type NewMove = {
      type: "newMove";
      times: {
        w: number;
        b: number;
      };
      /**
       * move in SAN formate
       * @example
       * "Rb1"
       */
      move: string;
      lastBookPly: number;
    };

    export type ClockUpdate = {
      type: "clockUpdate";
      timestamp: NumericStringInt;
      w: number;
      b: number;
    };
  }
}
