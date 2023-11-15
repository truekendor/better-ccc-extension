namespace lila {
  type TB_category =
    | "unknown"
    | "win"
    | "maybe-win"
    | "cursed-win"
    | "draw"
    | "blessed-loss"
    | "maybe-loss"
    | "loss";

  type tb_common_fields = {
    /**
     * `Distance to Zeroing`. After this move,
     * this is the minimum number of piece movements
     * until a capture or pawn movement.
     *
     *` dtz50''` with rounding or `null` if unknown
     */
    dtz: number | null;
    /** dtz50'' (only if guaranteed to be not rounded) or `null` if unknown */
    precise_dtz: number | null;
    /** `depth to mate` or null if unknown */
    dtm: number | null;
    checkmate: boolean;
    stalemate: boolean;
    /** only in chess variants (atomic, antichess) */
    variant_win: boolean;
    /** only in chess variants (atomic, antichess) */
    variant_loss: boolean;
    insufficient_material: boolean;
    category: TB_category;
  };

  type standard_move = Prettify<
    tb_common_fields & {
      /** move in `UCI` format ("h7h8q") */
      uci: string;
      /** move in `SAN` format ("h8=Q+") */
      san: string;
      zeroing: boolean;
    }
  >;

  export type standard_response =
    | Prettify<
        tb_common_fields & {
          /** information about legal moves, best first */
          moves: standard_move[];
        }
      >
    | string // if invalid fen requested
    | null;

  type mainline_move = {
    /**
     * move in uci format ("h7h8q")
     */
    uci: string;
    /**
     * move in san format ("h8=Q+")
     */
    san: string;
    /**
     * Distance to Zeroing. After this move,
     * this is the minimum number of piece movements
     * until a capture or pawn movement
     * (either of them resets, or zeros, the 50-move draw count).
     * dtz50'' with rounding or null if unknown
     */
    dtz: number;
    precise_dtz: number;
  };

  export type mainline_response =
    | {
        /** dtz mainline or empty if drawn */
        mainline: mainline_move[];
        /** ("w") white, ("b") black, (null) draw */
        winner: "w" | "b" | null;
        /**
         * Distance to Zeroing. After this move,
         * this is the minimum number of piece movements
         * until a capture or pawn movement
         * (either of them resets, or zeros, the 50-move draw count).
         * dtz50'' with rounding or null if unknown
         */
        dtz: number;
        precise_dtz: number;
      }
    | string // if invalid fen requested
    | null;
}
