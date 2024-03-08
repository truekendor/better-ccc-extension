// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars
namespace SVG {
  type PieceColor = "white" | "black";

  class SVGBase {
    protected static currentSVG: SVGSVGElement;

    protected static valuesToOptionsNames: Record<keyof SVGOption, string> = {
      d: "d",
      id: "id",
      width: "width",
      height: "height",
      viewBox: "viewBox",
      fill: "fill",
      stroke: "stroke",
      fillRule: "fill-rule",
      clipRule: "clip-rule",
      strokeWidth: "stroke-width",
      strokeLinecap: "stroke-linecap",
      strokeLinejoin: "stroke-linejoin",
    } as const;

    protected static createSVG(options: Partial<SVGOption>): SVGSVGElement {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

      const keys = Object.keys(options) as (keyof Partial<SVGOption>)[];

      keys.forEach((key) => {
        const parsedKey = this.valuesToOptionsNames[key];
        const value = options[key];

        // @ts-ignore
        svg.setAttribute(parsedKey, value);
      });

      this.currentSVG = svg;

      return svg;
    }

    protected static createPath(options: Partial<SVGOption>): void {
      if (!this.currentSVG) return;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      const keys = Object.keys(options) as (keyof Partial<SVGOption>)[];

      keys.forEach((key) => {
        const parsedKey = this.valuesToOptionsNames[key];
        const value = options[key];

        // @ts-ignore
        path.setAttribute(parsedKey, value);
      });

      this.currentSVG.append(path);
    }
  }

  export class ChessPieces extends SVGBase {
    // * SVGs are taken from https://github.com/lichess-org/lila/tree/master/public/piece/mpchess

    // * white pieces
    static get w_pawn(): SVGSVGElement {
      return this.createPawn("white");
    }

    static get w_bishop(): SVGSVGElement {
      return this.createBishop("white");
    }

    static get w_knight(): SVGSVGElement {
      return this.createKnight("white");
    }

    static get w_rook(): SVGSVGElement {
      return this.createRook("white");
    }

    static get w_queen(): SVGSVGElement {
      return this.createQueen("white");
    }

    // * black pieces
    static get b_pawn(): SVGSVGElement {
      return this.createPawn("black");
    }

    static get b_bishop(): SVGSVGElement {
      return this.createBishop("black");
    }

    static get b_knight(): SVGSVGElement {
      return this.createKnight("black");
    }

    static get b_rook(): SVGSVGElement {
      return this.createRook("black");
    }

    static get b_queen(): SVGSVGElement {
      return this.createQueen("black");
    }

    // *
    private static createPawn(color: PieceColor): SVGSVGElement {
      const fillColor = this.getFillColor(color);
      const strokeColor = this.getStrokeColor(color);

      const svg = this.createSVG({
        width: "20",
        height: "25",
        viewBox: "0 0 20 25",
        fill: "none",
      });

      this.createPath({
        d: "M9.87475 1.23387C8.83034 1.23387 7.82871 1.64876 7.0902 2.38727C6.35169 3.12578 5.9368 4.12741 5.9368 5.17182C5.93783 5.71491 6.05119 6.25191 6.26975 6.74908C6.4883 7.24625 6.80733 7.69284 7.20679 8.06079L4.97281 9.01977V11.3497L7.61578 11.3417C6.0608 21.3916 1.60886 18.3017 1.60886 23.8686H18.2656C18.2656 18.2227 13.7057 21.6366 12.1417 11.3387L14.7817 11.2987V8.98377L12.5717 8.03879C12.9634 7.67092 13.2756 7.2268 13.4892 6.73375C13.7028 6.2407 13.8132 5.70915 13.8137 5.17182C13.8137 4.6546 13.7118 4.14244 13.5138 3.6646C13.3159 3.18676 13.0257 2.7526 12.6599 2.38692C12.2942 2.02123 11.8599 1.73118 11.382 1.53334C10.9042 1.3355 10.392 1.23374 9.87475 1.23387Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51179",
      });

      return svg;
    }

    private static createBishop(color: PieceColor): SVGSVGElement {
      const fillColor = this.getFillColor(color);
      const strokeColor = this.getStrokeColor(color);

      const svg = this.createSVG({
        width: "25",
        height: "30",
        viewBox: "0 0 25 30",
        fill: "none",
      });

      this.createPath({
        d: "M19.6651 23.2428C24.0393 23.2428 24.2301 26.4856 24.2301 28.8932H1.51483C1.51483 26.4365 1.70149 23.2428 6.07573 23.2428H19.6651ZM19.7057 23.1899C20.5253 22.0863 24.5668 14.8371 16.6624 7.44811C16.6624 7.44811 13.4852 11.5603 12.9577 17.6378L11.0221 17.634C10.9856 12.0554 15.1204 6.28027 15.1204 6.28027C18.4478 0.00625792 7.51623 -0.0126397 10.5352 6.28027C1.30383 13.8733 5.41432 22.2261 6.09196 23.1899H19.7057Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51181",
      });

      return svg;
    }

    private static createKnight(color: PieceColor): SVGSVGElement {
      const fillColor = this.getFillColor(color);
      const strokeColor = this.getStrokeColor(color);

      const svg = this.createSVG({
        width: "25",
        height: "30",
        viewBox: "0 0 25 30",
        fill: "none",
      });

      this.createPath({
        d: "M19.6773 23.137H6.10819C6.29485 18.3445 12.0203 15.7971 12.28 13.4878C12.5438 11.1747 11.3751 10.5776 11.3751 10.5776C11.3751 10.5776 10.5758 13.3594 9.55727 13.9264C8.53878 14.4933 6.165 15.0261 6.165 15.0261C6.165 15.0261 4.50133 16.4245 3.52341 16.3263C2.54144 16.2318 1.70149 14.0472 1.70149 14.0472L5.02883 9.11117L6.72091 5.61134L8.31154 3.99367L8.99324 1.62016L10.9126 3.70647C21.4667 3.70647 23.7553 16.3754 19.6773 23.1332V23.137ZM19.6651 23.2429C24.0393 23.2429 24.2301 26.4857 24.2301 28.8932H1.51483C1.51483 26.4366 1.70149 23.2429 6.07573 23.2429H19.6651Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51181",
      });

      return svg;
    }

    private static createRook(color: PieceColor): SVGSVGElement {
      const fillColor = this.getFillColor(color);
      const strokeColor = this.getStrokeColor(color);

      const svg = this.createSVG({
        width: "25",
        height: "28",
        viewBox: "0 0 25 28",
        fill: "none",
      });

      this.createPath({
        d: "M19.6651 21.2429C24.0393 21.2429 24.2301 24.4857 24.2301 26.8932H1.51483C1.51483 24.4366 1.70149 21.2429 6.07573 21.2429H19.6651Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51181",
      });

      this.createPath({
        d: "M20.4685 21.2391L18.1678 8.94429H7.60143L5.32504 21.2391H20.4685Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51181",
      });

      this.createPath({
        d: "M20.1439 2.96508L16.8977 2.12597L16.1957 3.78516L14.8648 3.77766V1.41927L10.7989 1.48351V3.77766H9.61406L8.76194 2.12977L5.58067 3.29011C5.58067 3.29011 5.54821 9.07278 7.22 9.03876H18.5046C20.1764 9.03876 20.1439 2.96508 20.1439 2.96508Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: "1.51181",
      });

      return svg;
    }

    private static createQueen(color: PieceColor): SVGSVGElement {
      const fillColor = this.getFillColor(color);
      const strokeColor = this.getStrokeColor(color);
      const strokeWidth = color === "white" ? "1.4" : "1.2";

      const svg = this.createSVG({
        width: "34",
        height: "33",
        viewBox: "0 0 34 34",
        fill: "none",
      });

      this.createPath({
        d: "M25.6651 27.2429C30.0393 27.2429 30.2301 30.4857 30.2301 32.8932H7.51483C7.51483 30.4366 7.70149 27.2429 12.0757 27.2429H25.6651Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth,
      });

      this.createPath({
        d: "M15.0138 3.87296C14.6176 3.87269 14.2252 3.95051 13.859 4.10196C13.4929 4.25341 13.1602 4.47552 12.8799 4.7556C12.5996 5.03569 12.3773 5.36825 12.2256 5.7343C12.0739 6.10034 11.9959 6.49269 11.9959 6.88892C11.9962 7.49395 12.1786 8.08488 12.5192 8.58493C12.8598 9.08497 13.3429 9.47101 13.9058 9.69288L13.5328 17.8088L9.54888 11.2849C9.89435 10.7819 10.0791 10.186 10.0789 9.57588C10.0787 9.17982 10.0006 8.78766 9.84892 8.4218C9.69723 8.05594 9.47496 7.72354 9.19481 7.44357C8.91466 7.1636 8.58211 6.94156 8.21615 6.79012C7.85018 6.63867 7.45798 6.56079 7.06191 6.56092C6.26238 6.56119 5.49566 6.87892 4.93031 7.44428C4.36495 8.00963 4.04722 8.77635 4.04695 9.57588C4.04748 10.2866 4.29898 10.9743 4.7571 11.5177C5.21522 12.0611 5.85051 12.4252 6.55092 12.5458L11.3239 27.2357H26.4707L31.2306 12.6358C31.9497 12.5345 32.608 12.1771 33.0847 11.6293C33.5614 11.0815 33.8245 10.3801 33.8256 9.65388C33.8253 8.85435 33.5076 8.08763 32.9422 7.52228C32.3769 6.95692 31.6102 6.63919 30.8106 6.63892C30.0109 6.63892 29.2439 6.95654 28.6784 7.52192C28.1128 8.08731 27.7949 8.85417 27.7947 9.65388C27.7963 10.2139 27.9539 10.7624 28.2496 11.2379L24.1777 17.8078L23.8587 9.67988C24.413 9.45335 24.8873 9.06696 25.2212 8.56992C25.5551 8.07289 25.7335 7.4877 25.7337 6.88892C25.7337 6.08921 25.4161 5.32224 24.8507 4.75666C24.2853 4.19109 23.5184 3.87322 22.7187 3.87296C21.9188 3.87296 21.1517 4.19071 20.5861 4.75631C20.0205 5.32191 19.7028 6.08904 19.7028 6.88892C19.7027 7.67437 20.0091 8.42885 20.5567 8.99189L18.8548 17.8088L17.2298 8.92889C17.7428 8.37325 18.0283 7.64516 18.0298 6.88892C18.0298 6.08904 17.712 5.32191 17.1464 4.75631C16.5808 4.19071 15.8137 3.87296 15.0138 3.87296Z",
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth,
      });

      return svg;
    }

    // *
    private static getFillColor(
      color: PieceColor
    ): Extract<SVGColors, "white" | "black"> {
      const fillColor: Extract<SVGColors, "white" | "black"> =
        color === "white" ? "white" : "black";
      return fillColor;
    }

    private static getStrokeColor(
      color: PieceColor
    ): Extract<SVGColors, "black" | "#CBCACA"> {
      const strokeColor: Extract<SVGColors, "black" | "#CBCACA"> =
        color === "white" ? "black" : "#CBCACA";
      return strokeColor;
    }
  }

  export class Icons extends SVGBase {
    static get caretDown(): SVGSVGElement {
      const svg = this.createSVG({
        fill: "none",
        viewBox: "0 0 320 512",
        stroke: "none",
        height: "1em",
      });

      this.createPath({
        d: "M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: "2",
      });

      return svg;
    }

    static get wave(): SVGSVGElement {
      const svg = this.createSVG({
        viewBox: "0 0 1200 120",
      });

      this.createPath({
        d: "M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z",
      });

      return svg;
    }

    static get xMark(): SVGSVGElement {
      const svg = this.createSVG({
        viewBox: "0 0 384 512",
        height: "1em",
      });

      svg.setAttribute("viewBox", "0 0 384 512");
      svg.setAttribute("height", "1em");

      this.createPath({
        d: "M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z",
      });

      return svg;
    }

    static get clock(): SVGSVGElement {
      // default chess com timer
      // https://www.chess.com/bundles/web/images/svg/tic.b039b4f5.svg
      const svg = this.createSVG({
        viewBox: "0 0 16 16",
        fill: "white",
      });

      this.createPath({
        d: "M8.81,4.38a.78.78,0,0,0-.57-.23H7.78A.8.8,0,0,0,7,5V8.62a.82.82,0,0,0,.81.8h.46a.75.75,0,0,0,.57-.24A.8.8,0,0,0,9,8.62V5A.85.85,0,0,0,8.81,4.38Z",
      });

      this.createPath({
        d: "M11.12,15.38a8,8,0,0,0,2.54-1.71,8.13,8.13,0,0,0,1.72-2.55,8,8,0,0,0-1.72-8.78A8,8,0,0,0,8,0,8,8,0,0,0,2.34,2.34,8.06,8.06,0,0,0,.62,11.12a8.13,8.13,0,0,0,1.72,2.55,8.08,8.08,0,0,0,8.78,1.71ZM5.61,13.65a6.21,6.21,0,0,1-1.94-1.31A6.48,6.48,0,0,1,2.35,10.4,6,6,0,0,1,1.87,8a6,6,0,0,1,.48-2.39A6.12,6.12,0,0,1,3.67,3.67,6,6,0,0,1,5.61,2.36,5.81,5.81,0,0,1,8,1.87a5.81,5.81,0,0,1,2.39.49,6,6,0,0,1,1.94,1.31,6.12,6.12,0,0,1,1.32,1.94A6,6,0,0,1,14.13,8a6,6,0,0,1-.48,2.39,6.4,6.4,0,0,1-1.32,1.95,6.21,6.21,0,0,1-1.94,1.31A5.81,5.81,0,0,1,8,14.14,5.81,5.81,0,0,1,5.61,13.65Z",
      });

      return svg;
    }

    static get flask(): SVGSVGElement {
      const svg = this.createSVG({
        height: "1em",
        viewBox: "0 0 448 512",
      });

      // ? Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc.

      this.createPath({
        d: "M288 0H160 128C110.3 0 96 14.3 96 32s14.3 32 32 32V196.8c0 11.8-3.3 23.5-9.5 33.5L10.3 406.2C3.6 417.2 0 429.7 0 442.6C0 480.9 31.1 512 69.4 512H378.6c38.3 0 69.4-31.1 69.4-69.4c0-12.8-3.6-25.4-10.3-36.4L329.5 230.4c-6.2-10.1-9.5-21.7-9.5-33.5V64c17.7 0 32-14.3 32-32s-14.3-32-32-32H288zM192 196.8V64h64V196.8c0 23.7 6.6 46.9 19 67.1L309.5 320h-171L173 263.9c12.4-20.2 19-43.4 19-67.1z",
      });

      return svg;
    }

    static get gear(): SVGSVGElement {
      const svg = this.createSVG({
        viewBox: "0 0 24 24",
      });

      this.createPath({
        d: "M 10.490234 2 C 10.011234 2 9.6017656 2.3385938 9.5097656 2.8085938 L 9.1757812 4.5234375 C 8.3550224 4.8338012 7.5961042 5.2674041 6.9296875 5.8144531 L 5.2851562 5.2480469 C 4.8321563 5.0920469 4.33375 5.2793594 4.09375 5.6933594 L 2.5859375 8.3066406 C 2.3469375 8.7216406 2.4339219 9.2485 2.7949219 9.5625 L 4.1132812 10.708984 C 4.0447181 11.130337 4 11.559284 4 12 C 4 12.440716 4.0447181 12.869663 4.1132812 13.291016 L 2.7949219 14.4375 C 2.4339219 14.7515 2.3469375 15.278359 2.5859375 15.693359 L 4.09375 18.306641 C 4.33275 18.721641 4.8321562 18.908906 5.2851562 18.753906 L 6.9296875 18.1875 C 7.5958842 18.734206 8.3553934 19.166339 9.1757812 19.476562 L 9.5097656 21.191406 C 9.6017656 21.661406 10.011234 22 10.490234 22 L 13.509766 22 C 13.988766 22 14.398234 21.661406 14.490234 21.191406 L 14.824219 19.476562 C 15.644978 19.166199 16.403896 18.732596 17.070312 18.185547 L 18.714844 18.751953 C 19.167844 18.907953 19.66625 18.721641 19.90625 18.306641 L 21.414062 15.691406 C 21.653063 15.276406 21.566078 14.7515 21.205078 14.4375 L 19.886719 13.291016 C 19.955282 12.869663 20 12.440716 20 12 C 20 11.559284 19.955282 11.130337 19.886719 10.708984 L 21.205078 9.5625 C 21.566078 9.2485 21.653063 8.7216406 21.414062 8.3066406 L 19.90625 5.6933594 C 19.66725 5.2783594 19.167844 5.0910937 18.714844 5.2460938 L 17.070312 5.8125 C 16.404116 5.2657937 15.644607 4.8336609 14.824219 4.5234375 L 14.490234 2.8085938 C 14.398234 2.3385937 13.988766 2 13.509766 2 L 10.490234 2 z M 12 8 C 14.209 8 16 9.791 16 12 C 16 14.209 14.209 16 12 16 C 9.791 16 8 14.209 8 12 C 8 9.791 9.791 8 12 8 z",
      });

      return svg;
    }
  }
}
