// * ===================
// * chess.com response types

declare namespace chess_com {
  type game_result_as_score = "1/2-1/2" | "1-0" | "0-1";
  type result_as_score = "½" | "1" | "0";

  type game_end_reason =
    | "checkmate"
    | "adjudication"
    | "3fold"
    | "50moves"
    | "crash";

  export type game_response = {
    end: game_end_reason;
    res: game_result_as_score;
    lastBookPly: number;
    pgn: string;
    info: InfoEntry[];
    kibitzerHistory: kibitzer_entry[];
  } | null;

  type kibitzer_history_log = {
    color: "white" | "black";
    ply: number;
    /** number `float` in string format like `+0.77` or `-1.22` */
    score: string;
    /** number `int` in string format */
    depth: string;
    /** number `int` in string format */
    nodes: string;
    /** number `int` in string format */
    speed: string;
    /** number `int` in string format */
    tbhits: string;
    /** moves in UCI format like "d1b3 d8b6 f3d2 f5g6 h2h4" */
    pv: string;
  };

  type info_history_log = Prettify<
    kibitzer_history_log & {
      /** number `int` in string format */
      timestamp: string;
      time: number;
    }
  >;

  type kibitzer_entry = Prettify<kibitzer_history_log | null | EmptyObject>;

  type InfoEntry =
    | (RequireOnlyOne<{
        w: kibitzer_entry;
        b: kibitzer_entry;
      }> & { ply: number })
    | null
    | EmptyObject;

  // * ===================
  // * Full event response types
  // * like https://cccc.chess.com/archive?event=ccc21-rapid-semifinals
  type full_event_response = {
    type: "fullUpdate" | unknown;
    pgn: string;
    info: InfoEntry[];
    kibitzerHistory: kibitzer_entry[];
    res: game_result_as_score;
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
     * string with current event __id__ like `ccc21-rapid-semifinals`
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

    // ! not yet typed
    millisecondsLeftToVote: unknown;
    engineinfo: unknown[];
    voteLeaderboard: unknown[];
    voteAccuracyLeaderboard: unknown[];
  } | null;

  type standings_entry = {
    /** number `int` in string format */
    engineid: string;
    /** number `float` in string format (int +- 0.5) */
    score: string;
    games: number;
    name: string;
    version: string;
    /** number `int` in string format
     */
    rating: string;
    country: string;
    authors: string | null;
    website: string | null;
    /** number `int` in string format*/
    year: string;
    facts: string | null;
    flag: string;
    dateupdated: number;
    ucisettings: [string | number, string | number][];
    /**
     * number `float` in string format */
    sb: string;
    /** performance(%) `float` in string format */
    perf: string;
    rank: number;
  };

  type standings = {
    standings: standings_entry[];
    gamesPlayed: number;
  };

  type crosstable = {
    [key: string]: {
      [key: string]: {
        results: {
          r: result_as_score;
          /** number `int` in string format */
          id: string;
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
    /** number `int` in string format */
    id: string;
    colors: ["w" | "b", "w" | "b"];
    result: [result_as_score, result_as_score];
    opening: string;
    /** evals in format like "+-" / "--" */
    evals: [string, string];
    /** game duration in string format like "00:23:14" */
    duration: string;
    index: number;
  };

  type schedule_entry = {
    /** number `int` in string format */
    id: string;
    p: [number, number];
    numMoves: number;
    res: game_result_as_score;
  };
}
