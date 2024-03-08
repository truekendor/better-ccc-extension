type ChessGameCacheEntry = {
  pgn: string[];
  // todo delete?
  type: "intermediate-cache" | "full-game";
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ChessGamesCache {
  public static cache = new Map<number, ChessGameCacheEntry>();
  private static currentEventId: string;

  static async cacheCurrent(): Promise<void> {
    const pgn = ExtractPageData.getPGNFromMoveTable();
    const gameNumber = await ExtractPageData.getCurrentGameNumber();
    const eventId = _State.eventId;

    if (!eventId) return;

    ChessGamesCache.cacheFromObject({
      eventId,
      gameNumber,
      pgn,
      type: "full-game",
    });
  }

  static cacheFromObject({
    eventId,
    gameNumber,
    pgn,
    type,
  }: {
    gameNumber: number;
    eventId: string;
    pgn: string[];
    type: ChessGameCacheEntry["type"];
  }): void {
    if (this.currentEventId !== eventId) {
      this.currentEventId = eventId;
      this.cache.clear();
    }

    this.cache.set(gameNumber, {
      type,
      pgn,
    });
  }

  static getGame(gameNumber: number): ChessGameCacheEntry | null {
    if (!this.currentEventId) {
      return null;
    }

    if (!this.cache.has(gameNumber)) {
      return null;
    }

    return this.cache.get(gameNumber)!;
  }
}
