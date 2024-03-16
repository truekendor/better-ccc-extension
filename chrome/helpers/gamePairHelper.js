"use strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class GamePairHelper {
    static getReverseGameNumber(currentGameNumber) {
        const offset = currentGameNumber % 2 === 0 ? -1 : 1;
        return currentGameNumber + offset;
    }
    static isReverse(gameNumber1, gameNumber2) {
        if (Math.abs(gameNumber1 - gameNumber2) !== 1) {
            return false;
        }
        return gameNumber1 % 2 === 1
            ? gameNumber2 === gameNumber1 + 1
            : gameNumber2 === gameNumber1 - 1;
    }
}
