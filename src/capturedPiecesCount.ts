/**
 * Puts a captured pieces wrapper as first child of each engine clock row.
 * CCC re-creates the engine panels (Engines/Analysis tab switch, layout
 * changes...), so this runs again whenever a clock row has lost its wrapper.
 * Returns true if a wrapper was inserted.
 */
function ensureCapturedPiecesWrappers(): boolean {
  const clockWrappers: NodeListOf<HTMLDivElement> = document.querySelectorAll(
    ".enginedata-clock-wrapper"
  );

  let inserted = false;

  // first clock row is the top engine, second one the bottom engine
  clockWrappers.forEach((wrapper, i) => {
    if (i > 1 || !wrapper.firstChild) {
      return;
    }
    if (wrapper.querySelector(":scope > .ccc-captured-pieces-wrapper")) {
      return;
    }

    const piecesWrapper = components.Webpage.crCapturedPiecesWrapper();
    if (!UserSettings.customSettings.showCapturedPieces) {
      piecesWrapper.classList.add("ccc-hide");
    }

    wrapper.insertBefore(piecesWrapper, wrapper.firstChild);
    inserted = true;
  });

  return inserted;
}

(function watchEnginePanels(): void {
  ensureCapturedPiecesWrappers();

  const root = document.querySelector(".cpu-champs-page-main") ?? document.body;
  let scheduled = false;

  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      if (ensureCapturedPiecesWrappers()) {
        CountCapturedPieces.recount();
      }
    });
  });

  observer.observe(root, { childList: true, subtree: true });
})();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CountCapturedPieces {
  private static pieceAmountDefault: Record<ChessPieces, number> = {
    K: 1,
    B: 2,
    N: 2,
    R: 2,
    P: 8,
    Q: 1,
    //
    k: 1,
    b: 2,
    n: 2,
    r: 2,
    p: 8,
    q: 1,
  } as const;

  private static pieceValues: Record<ChessPieces, number> = {
    K: 0,
    P: -1,
    R: -5,
    N: -3,
    B: -3,
    Q: -9,
    //
    k: 0,
    p: 1,
    r: 5,
    n: 3,
    b: 3,
    q: 9,
  } as const;

  /** last counted position, to fill re-created wrappers */
  private static lastFen = "";

  // looked up on every count: CCC re-creates the engine panels
  private static get whitePiecesWrapper(): Element | null {
    return document.querySelectorAll(".ccc-captured-pieces-wrapper")[1] ?? null;
  }

  private static get blackPiecesWrapper(): Element | null {
    return document.querySelector(".ccc-captured-pieces-wrapper");
  }

  private static boardState: Prettify<
    Record<ChessPieces, number> & {
      capturePoints: number;
      piecesLeft: number;
    }
  > = {
    // white pieces
    P: 0,
    B: 0,
    N: 0,
    R: 0,
    Q: 0,
    K: 0,
    // black pieces
    p: 0,
    b: 0,
    n: 0,
    r: 0,
    q: 0,
    k: 0,
    //
    capturePoints: 0,
    piecesLeft: 32,
  };

  // todo add description
  static count(fen: string): void {
    const keys = Utils.objectKeys(this.boardState);

    // reset boardState
    keys.forEach((key) => {
      this.boardState[key] = 0;
    });
    this.boardState.piecesLeft = 32;

    if (!fen) {
      console.log("Count Material\nFEN is undefined");
      return;
    }
    this.lastFen = fen;

    // removes digits and "/" from FEN string
    const pieceArray = fen
      .split(" ")[0]!
      .replace(/\d/g, "")
      .replace(/\//g, "")
      .split("") as Array<ChessPieces>;

    pieceArray.forEach((piece) => {
      this.boardState[piece] += 1;
    });

    keys.forEach((key) => {
      if (key === "capturePoints" || key === "piecesLeft") return;

      const diff = this.pieceAmountDefault[key] - this.boardState[key];

      this.boardState[key] = diff;

      this.boardState.capturePoints += diff * this.pieceValues[key];
      this.boardState.piecesLeft -= diff;
    });

    const whitePiecesWrapper = this.whitePiecesWrapper;
    const blackPiecesWrapper = this.blackPiecesWrapper;

    // engine panels not rendered (other middle tab): recount() refills them
    if (!whitePiecesWrapper || !blackPiecesWrapper) {
      return;
    }

    Utils.removeChildNodes(whitePiecesWrapper);
    Utils.removeChildNodes(blackPiecesWrapper);

    keys.forEach((key) => {
      if (
        key === "capturePoints" ||
        key === "piecesLeft" ||
        this.boardState[key] === 0
      ) {
        return;
      }

      const span = document.createElement("span");
      span.classList.add("ccc-piece-type");

      const isWhitePiece = key === key.toUpperCase();
      const prefix = isWhitePiece ? "w" : "b";

      for (let i = 0; i < this.boardState[key]; i++) {
        let svg: SVGSVGElement | null = null;

        switch (key) {
          case "P":
          case "p":
            svg = SVG.ChessPieces[`${prefix}_pawn`];
            break;
          case "B":
          case "b":
            svg = SVG.ChessPieces[`${prefix}_bishop`];
            break;
          case "N":
          case "n":
            svg = SVG.ChessPieces[`${prefix}_knight`];
            break;
          case "R":
          case "r":
            svg = SVG.ChessPieces[`${prefix}_rook`];
            break;
          case "Q":
          case "q":
            svg = SVG.ChessPieces[`${prefix}_queen`];
            break;
          case "K":
          case "k":
            break;
          default:
            console.log(key satisfies never);
            break;
        }

        if (svg) {
          span.append(svg);
        }
      }

      if (isWhitePiece) {
        blackPiecesWrapper.appendChild(span);
      } else {
        whitePiecesWrapper.appendChild(span);
      }
    });

    if (this.boardState.capturePoints > 0) {
      const blacksScore: HTMLSpanElement =
        blackPiecesWrapper.querySelector("._ccc-capture-score")!;

      if (blacksScore) {
        blacksScore.textContent = "";
      }

      const span = document.createElement("span");
      span.classList.add("_ccc-capture-score");

      span.textContent += `+${Math.abs(this.boardState.capturePoints)}`;
      whitePiecesWrapper.append(span);
    } else if (this.boardState.capturePoints < 0) {
      const whitesScore: HTMLSpanElement =
        whitePiecesWrapper.querySelector("._ccc-capture-score")!;

      if (whitesScore) {
        whitesScore.textContent = "";
      }

      const span = document.createElement("span");
      span.classList.add("_ccc-capture-score");

      span.textContent += `+${Math.abs(this.boardState.capturePoints)}`;
      blackPiecesWrapper.append(span);
    }
  }

  static get piecesLeft(): number {
    return this.boardState.piecesLeft;
  }

  /** fills the wrappers again, e.g. after CCC re-created them */
  static recount(): void {
    if (this.lastFen) {
      this.count(this.lastFen);
    }
  }

  static clear() {
    this.count(ChessJS.startingPosition);
  }
}
