"use strict";
class TranspositionEntry {
    constructor({ currentPly, reversePly, fen }) {
        this.currentPly = currentPly;
        this.reversePly = reversePly;
        this.fen = fen;
    }
}
class TranspositionsObjectPool {
    constructor() {
        this.index = 0;
        this.pool = this.setupTranspositionsList();
    }
    add(obj) {
        if (this.index === this.pool.length) {
            return;
        }
        this.pool[this.index].currentPly = obj.currentPly;
        this.pool[this.index].reversePly = obj.reversePly;
        this.pool[this.index].fen = obj.fen;
        this.index += 1;
    }
    reset() {
        this.pool.forEach((_, index, arr) => {
            arr[index].currentPly = -1;
            arr[index].reversePly = -1;
            arr[index].fen = "";
        });
        this.index = 0;
    }
    get values() {
        return this.pool.slice(0, this.index);
    }
    setupTranspositionsList() {
        const arr = new Array(100)
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
    static get agreementLength() {
        return this.sequentialAgreementLength;
    }
    static get transpositions() {
        return this.transpositionsObjectPool.values;
    }
    /**
     * todo add description
     */
    static find(chessCurrent, chessReverse) {
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
            this.transpositionsObjectPool.add(new TranspositionEntry({
                currentPly: fenPly,
                reversePly: reversePly,
                fen: fenKey,
            }));
        });
    }
    static reset() {
        this.currentGameFenMap.clear();
        this.reverseGameFenMap.clear();
        this.transpositionsObjectPool.reset();
        this.sequentialAgreementLength = 0;
    }
    static calcSequentialAgreementFromPGN(chessCurrent, chessReverse) {
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
FindTranspositions.sequentialAgreementLength = 0;
FindTranspositions.transpositionsObjectPool = new TranspositionsObjectPool();
FindTranspositions.currentGameFenMap = new Map();
FindTranspositions.reverseGameFenMap = new Map();
