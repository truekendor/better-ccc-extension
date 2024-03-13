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
    const eloDiff = this.calculateEloDifference(percent / 100);
    const sign = eloDiff > 0 ? "+" : "";

    const eloDiffAsString = formatter.format(eloDiff);

    return `${sign}${eloDiffAsString}`;
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
    const percentage = (wins + draws * 0.5) / total;
    const winsDev = winP * Math.pow(1 - percentage, 2);
    const drawsDev = drawP * Math.pow(0.5 - percentage, 2);
    const lossesDev = lossP * Math.pow(0 - percentage, 2);
    const stdDeviation =
      Math.sqrt(winsDev + drawsDev + lossesDev) / Math.sqrt(total);

    const confidenceP = this.confidence;

    const minConfidenceP = (1 - confidenceP) / 2;
    const maxConfidenceP = 1 - minConfidenceP;
    const devMin = percentage + this.phiInv(minConfidenceP) * stdDeviation;
    const devMax = percentage + this.phiInv(maxConfidenceP) * stdDeviation;

    const difference =
      this.calculateEloDifference(devMax) - this.calculateEloDifference(devMin);

    const errorMargin = formatter.format(difference / 2);

    return `${errorMargin}`;
  }

  private static calculateEloDifference(percentage: number): number {
    return (-400 * Math.log(1 / percentage - 1)) / Math.LN10;
  }

  private static calculateInverseErrorFunction(x: number): number {
    const a: number = (8 * (Math.PI - 3)) / (3 * Math.PI * (4 - Math.PI));
    const y: number = Math.log(1 - x * x);
    const z: number = 2 / (Math.PI * a) + y / 2;

    const ret = Math.sqrt(Math.sqrt(z * z - y / a) - z);

    if (x < 0) return -ret;

    return ret;
  }

  private static phiInv(p: number): number {
    return Math.sqrt(2) * this.calculateInverseErrorFunction(2 * p - 1);
  }
}
