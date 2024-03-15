"use strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ChessGamesCache {
    static async cacheCurrent() {
        const pgn = ExtractPageData.getPGNFromMoveTable();
        const gameNumber = await ExtractPageData.getCurrentGameNumber();
        ChessGamesCache.cacheFromObject({
            gameNumber,
            pgn,
            type: "full-game",
        });
    }
    static cacheFromObject({ gameNumber, pgn, type }) {
        this.cache.set(gameNumber, {
            type,
            pgn,
        });
    }
    static getGame(gameNumber) {
        return this.cache.get(gameNumber) || null;
    }
}
ChessGamesCache.cache = new Map();
