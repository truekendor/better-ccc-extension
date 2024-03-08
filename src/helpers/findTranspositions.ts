class TranspositionEntry {
  public currentPly: number;
  public reversePly: number;
  public fen: string;

  constructor({ currentPly, reversePly, fen }: TranspositionEntry) {
    this.currentPly = currentPly;
    this.reversePly = reversePly;
    this.fen = fen;
  }
}

class TranspositionsObjectPool {
  private index = 0;
  private pool = this.setupTranspositionsList();

  add(obj: TranspositionEntry): void {
    if (this.index === this.pool.length) {
      return;
    }

    this.pool[this.index].currentPly = obj.currentPly;
    this.pool[this.index].reversePly = obj.reversePly;
    this.pool[this.index].fen = obj.fen;

    this.index += 1;
  }

  reset(): void {
    this.pool.forEach((_, index, arr) => {
      arr[index].currentPly = -1;
      arr[index].reversePly = -1;
      arr[index].fen = "";
    });

    this.index = 0;
  }

  get values(): readonly TranspositionEntry[] {
    return this.pool.slice(0, this.index);
  }

  private setupTranspositionsList(): readonly TranspositionEntry[] {
    const arr: readonly TranspositionEntry[] = new Array(100)
      .fill(null)
      .map(() => {
        return new TranspositionEntry({
          currentPly: -1,
          reversePly: -1,
          fen: "",
        });
      });

    return arr;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class FindTranspositions {
  private static sequentialAgreementLength: number = 0;
  private static transpositionsObjectPool = new TranspositionsObjectPool();

  private static currentGameFenMap = new Map<string, number>();
  private static reverseGameFenMap = new Map<string, number>();

  static get agreementLength(): number {
    return this.sequentialAgreementLength;
  }

  static get transpositions(): readonly TranspositionEntry[] {
    return this.transpositionsObjectPool.values;
  }

  /**
   * todo add description
   */
  static find<T extends ReturnType<typeof ChessJS.chess>>(
    chessCurrent: T,
    chessReverse: T
  ): void {
    this.reset();
    this.calcSequentialAgreementFromPGN(chessCurrent, chessReverse);

    if (this.sequentialAgreementLength <= 0) {
      return;
    }

    chessCurrent.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      this.currentGameFenMap.set(fenStr, index);
    });

    chessReverse.fields.FenHistoryTrimmed.forEach((fenStr, index) => {
      this.reverseGameFenMap.set(fenStr, index);
    });

    this.currentGameFenMap.forEach((fenPly, fenKey) => {
      if (fenPly < this.sequentialAgreementLength) {
        return;
      }
      const reversePly = this.reverseGameFenMap.get(fenKey);

      if (!this.reverseGameFenMap.has(fenKey) || !reversePly) {
        return;
      }

      this.transpositionsObjectPool.add(
        new TranspositionEntry({
          currentPly: fenPly,
          reversePly: reversePly,
          fen: fenKey,
        })
      );
    });
  }

  static reset(): void {
    this.currentGameFenMap.clear();
    this.reverseGameFenMap.clear();

    this.transpositionsObjectPool.reset();

    this.sequentialAgreementLength = 0;
  }

  private static calcSequentialAgreementFromPGN<
    T extends ReturnType<typeof ChessJS.chess>
  >(chessCurrent: T, chessReverse: T): void {
    const currentPGN = chessCurrent.fields.pgn;
    const reversePGN = chessReverse.fields.pgn;

    if (!currentPGN || !reversePGN) {
      this.sequentialAgreementLength = -1;
      return;
    }

    let sequentialAgreementLength = 0;

    for (let i = 0; i < currentPGN.length; i++) {
      if (currentPGN[i] !== reversePGN[i]) {
        break;
      }

      sequentialAgreementLength++;
    }

    this.sequentialAgreementLength = sequentialAgreementLength;
  }
}
