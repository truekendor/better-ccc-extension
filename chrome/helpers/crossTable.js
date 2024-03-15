"use strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CrosstableHelper {
    /** gets scores from a NodeList and returns them as an array */
    static getScoresFromList(gameResultElementList) {
        const scoresArray = [];
        gameResultElementList.forEach((result) => {
            scoresArray.push(this.getResultFromNode(result));
        });
        return scoresArray;
    }
    /**
     * calculates WDL, ELO and all additional stats
     */
    static calculateStats(scoresArray) {
        const wdlArray = [0, 0, 0]; // [W D L] in that order
        scoresArray.forEach((score) => {
            // score is either 1 0 -1
            // so by doing this we automatically
            // increment correct value
            wdlArray[1 - score] += 1;
        });
        // get rid of an unfinished game pair
        if (scoresArray.length % 2 === 1)
            scoresArray.pop();
        const ptnml = [0, 0, 0, 0, 0]; // ptnml(0-2)
        const stats = {
            longestLossless: 0,
            longestWinStreak: 0,
            pairsRatio: 0,
            performancePercent: 0,
            longestWinless: 0,
            highestScore: 0,
            pairsWL: [0, 0],
        };
        let highestScore = 0;
        let currentScore = 0;
        for (let i = 0; i < scoresArray.length; i++) {
            const cur = scoresArray[i];
            currentScore += cur;
            // update after finished pair
            if (i % 2 === 1) {
                highestScore = Math.max(currentScore, highestScore);
            }
        }
        // lossless
        let longesLosslessRecord = 0;
        let longesLosslessCurrent = 0;
        // win streak
        let longestWinRecord = 0;
        let longestWinCurrent = 0;
        // winless
        let longestWinlessRecord = 0;
        let longestWinlessCurrent = 0;
        for (let i = 0; i < scoresArray.length; i += 2) {
            const first = scoresArray[i];
            const second = scoresArray[i + 1];
            const res = first + second;
            if (res === 2) {
                ptnml[4] += 1;
                longesLosslessCurrent += 1;
                longestWinCurrent += 1;
                longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
                longesLosslessRecord = Math.max(longesLosslessCurrent, longesLosslessRecord);
                longestWinlessRecord = Math.max(longestWinlessCurrent, longestWinlessRecord);
                // reset
                longestWinlessCurrent = 0;
            }
            else if (res === 1) {
                ptnml[3] += 1;
                longesLosslessCurrent += 1;
                longestWinCurrent += 1;
                longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
                longesLosslessRecord = Math.max(longesLosslessCurrent, longesLosslessRecord);
                longestWinlessRecord = Math.max(longestWinlessCurrent, longestWinlessRecord);
                // reset
                longestWinlessCurrent = 0;
            }
            else if (res === 0) {
                ptnml[2] += 1;
                longesLosslessCurrent += 1;
                longestWinlessCurrent += 1;
                longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
                longesLosslessRecord = Math.max(longesLosslessCurrent, longesLosslessRecord);
                longestWinlessRecord = Math.max(longestWinlessCurrent, longestWinlessRecord);
                // reset
                longestWinCurrent = 0;
            }
            else if (res === -1) {
                ptnml[1] += 1;
                longestWinlessCurrent += 1;
                longesLosslessRecord = Math.max(longesLosslessCurrent, longesLosslessRecord);
                longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
                longestWinlessRecord = Math.max(longestWinlessCurrent, longestWinlessRecord);
                // reset
                longestWinCurrent = 0;
                longesLosslessCurrent = 0;
            }
            else {
                ptnml[0] += 1;
                longestWinlessCurrent += 1;
                longesLosslessRecord = Math.max(longesLosslessCurrent, longesLosslessRecord);
                longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
                longestWinlessRecord = Math.max(longestWinlessCurrent, longestWinlessRecord);
                // reset
                longestWinCurrent = 0;
                longesLosslessCurrent = 0;
            }
        }
        stats.longestLossless = longesLosslessRecord;
        stats.longestWinStreak = longestWinRecord;
        stats.longestWinless = longestWinlessRecord;
        stats.performancePercent =
            ((wdlArray[0] + wdlArray[1] / 2) /
                (wdlArray[0] + wdlArray[1] + wdlArray[2])) *
                100;
        stats.pairsWL[0] = ptnml[4] + ptnml[3];
        stats.pairsWL[1] = ptnml[1] + ptnml[0];
        stats.pairsRatio = (ptnml[4] + ptnml[3]) / (ptnml[1] + ptnml[0]);
        stats.highestScore = highestScore;
        return [ptnml, wdlArray, stats];
    }
    /**
     * todo add description
     */
    static paintGamePairs(gameResultList, scoresArray, pairsPerRow) {
        gameResultList.forEach((elem, index) => {
            elem.id = "ccc-result";
            const isEven = index % 2 === 0;
            const temp = index % (pairsPerRow * 2) === 0;
            const isFirstElementInRow = isEven && temp;
            if (!isEven) {
                elem.classList.add("ccc-border-right");
                const className = this.getClassNameForPair(scoresArray[index - 1], scoresArray[index]);
                elem.classList.add(className);
                gameResultList[index - 1].classList.add(className);
            }
            else if (isFirstElementInRow || pairsPerRow === 1) {
                elem.classList.add("ccc-border-left");
            }
        });
    }
    // * ========================
    // * private methods
    static getResultFromNode(node) {
        if (node.classList.contains("win"))
            return 1;
        if (node.classList.contains("draw"))
            return 0;
        return -1;
    }
    static getClassNameForPair(lastResult, currentResult) {
        const pairScore = lastResult + currentResult;
        if (pairScore === 2)
            return this.classNames.doubleWin;
        if (pairScore === 1)
            return this.classNames.win;
        if (pairScore === 0)
            return this.classNames.draw;
        if (pairScore === -1)
            return this.classNames.loss;
        return this.classNames.doubleLoss;
    }
}
// extensions css classes for gamepairs
CrosstableHelper.classNames = {
    doubleWin: "ccc-double-win",
    win: "ccc-win",
    draw: "ccc-draw",
    loss: "ccc-loss",
    doubleLoss: "ccc-double-loss",
};
