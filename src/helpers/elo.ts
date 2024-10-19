// these formulas are taken from https://3dkingdoms.com/chess/elo.htm
// and I have no idea how they work

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ELO {
  private static confidenceIntervals = {
    default: 0.95,
    sigma2: 0.954499736103642,
    // for the memes
    sigma3: 0.99730020393674,
    sigma4: 0.999936657516334,
    sigma5: 0.999999426696856,
    sigma6: 0.999999998026825,
  } as const;

  static confidence = this.confidenceIntervals["sigma2"];

  static calculateEloFromPercent(percent: number): string {
    const eloDiff = this.scoreToElo(percent / 100);
    const sign = eloDiff > 0 ? "+" : "";

    const eloDiffAsString = formatter.format(eloDiff);

    return `${sign}${eloDiffAsString}`;
  }

  static ptnmlElo(ptnml: PTNML): [number, number] {
    const totalPairs = ptnml[0] + ptnml[1] + ptnml[2] + ptnml[3] + ptnml[4];
    const doubleWins = ptnml[4];
    const singleWins = ptnml[3];
    const doubleDraws = ptnml[2];
    const singleLoss = ptnml[1];
    const doubleLoss = ptnml[0];

    const score =
      (doubleWins +
        singleWins * 0.75 +
        doubleDraws * 0.5 +
        singleLoss * 0.25 +
        doubleLoss * 0) /
      totalPairs;

    const doubleWinsPercent = doubleWins / totalPairs;
    const singleWinsPercent = singleWins / totalPairs;
    const doubleDrawsPercent = doubleDraws / totalPairs;
    const singleLossPercent = singleLoss / totalPairs;
    const doubleLossPercent = doubleLoss / totalPairs;

    const doubleWinsDev = doubleWinsPercent * (1 - score) ** 2;
    const singleWinsDev = singleWinsPercent * (0.75 - score) ** 2;
    const doubleDrawsDev = doubleDrawsPercent * (0.5 - score) ** 2;
    const singleLossDev = singleLossPercent * (0.25 - score) ** 2;
    const doubleLossDev = doubleLossPercent * (0 - score) ** 2;

    const sum =
      doubleWinsDev +
      singleWinsDev +
      doubleDrawsDev +
      singleLossDev +
      doubleLossDev;

    const stdDeviation = Math.sqrt(sum / totalPairs);

    const confidencePercent = this.confidence;

    const minConfidenceP = (1 - confidencePercent) / 2;
    const maxConfidenceP = 1 - minConfidenceP;
    const devMin = score + this.phiInv(minConfidenceP) * stdDeviation;
    const devMax = score + this.phiInv(maxConfidenceP) * stdDeviation;

    const elo = this.scoreToElo(score);
    const difference = this.scoreToElo(devMax) - this.scoreToElo(devMin);

    const errorMargin = difference / 2;

    return [elo, errorMargin] as const;
  }

  static calculateErrorMargin(
    wins: number,
    draws: number,
    losses: number
  ): string {
    const total = wins + draws + losses;
    const winP = wins / total;
    const drawP = draws / total;
    const lossP = losses / total;
    const score = (wins + draws * 0.5) / total;
    const winsDev = winP * Math.pow(1 - score, 2);
    const drawsDev = drawP * Math.pow(0.5 - score, 2);
    const lossesDev = lossP * Math.pow(0 - score, 2);
    const stdDeviation =
      Math.sqrt(winsDev + drawsDev + lossesDev) / Math.sqrt(total);

    const confidenceP = this.confidence;

    const minConfidenceP = (1 - confidenceP) / 2;
    const maxConfidenceP = 1 - minConfidenceP;
    const devMin = score + this.phiInv(minConfidenceP) * stdDeviation;
    const devMax = score + this.phiInv(maxConfidenceP) * stdDeviation;

    const difference = this.scoreToElo(devMax) - this.scoreToElo(devMin);

    const errorMargin = formatter.format(difference / 2);

    return `${errorMargin}`;
  }


  static LOS(elo: number, errorMargin: number) {
    const minConfidencePercent = (1 - this.confidence) / 2;
    const maxConfidencePercent = 1 - minConfidencePercent;

    const eloStdDev = errorMargin / this.phiInv(maxConfidencePercent);
    const LOS = ELO.Math.erfc(-elo / (Math.sqrt(2) * eloStdDev)) / 2;

    return LOS;
  }


  private static scoreToElo(score: number): number {
    return (-400 * Math.log(1 / score - 1)) / Math.LN10;
  }

  private static eloToScore(elo: number) {
    return 1 / (1 + 10 ** (-elo / 400));
  }

  private static phiInv(p: number): number {
    return this.Math.ppf(p);
  }

  private static _crMathInst() {
    return class _Math {
      /**
       *  `Percent point function`
       *
       * 3dkingdoms implementation
       * @link https://3dkingdoms.com/chess/elo.htm
       */
      static ppf(x: number): number {
        return Math.sqrt(2) * this.erfinv(2 * x - 1);
      }

      /**
       * `Inverse Error Function`
       *
       * 3dkingdoms implementation
       * @link https://3dkingdoms.com/chess/elo.htm
       */
      static erfinv(x: number): number {
        const a: number = (8 * (Math.PI - 3)) / (3 * Math.PI * (4 - Math.PI));
        const y: number = Math.log(1 - x * x);
        const z: number = 2 / (Math.PI * a) + y / 2;

        const ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);
        const sign = x < 0 ? -1 : 1;

        return ret * sign;
      }

      /**
       * `Error function`
       *
       * @link https://en.wikipedia.org/wiki/Error_function
       * @implements https://hewgill.com/picomath/javascript/erf.js.html
       */
      static erf(x: number): number {
        if (x === 0) {
          return 0.0;
        }
        // constants
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);

        // A&S formula 7.1.26
        const t = 1.0 / (1.0 + p * x);
        const y =
          1.0 -
          ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        const result = sign * y;

        return result;
      }

      /**
       * `Complementary error function`
       *
       * @link https://en.wikipedia.org/wiki/Error_function
       */
      static erfc(x: number): number {
        return 1 - this.erf(x);
      }

      /**
       * `Cumulative distribution function`
       *
       * @link https://en.wikipedia.org/wiki/Cumulative_distribution_function
       * @link https://stackoverflow.com/questions/5259421/cumulative-distribution-function-in-javascript
       */
      static cdf(mean: number, sigma: number, to: number): number {
        const z = (to - mean) / Math.sqrt(2 * sigma * sigma);
        const erf = this.erf(z);

        return 0.5 * (1 + erf);
      }
    };
  }

  private static Math = this._crMathInst();
}
