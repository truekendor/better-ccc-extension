// eslint-disable-next-line @typescript-eslint/no-unused-vars
class DebugPanel {
  private static debugPanel = document.createElement("div");
  private static pingElement = document.createElement("div");
  private static panelButtons = this.oldButtons();
  private static timerId = 0;

  private static logsHistoryMainContent = document.createElement("main");
  private static logsHistoryContainer: HTMLDivElement =
    this.crLogsHistoryContainer()!;

  // private static _ = this.init();

  static crCollapseDebugPanelBtn() {
    const btn = document.createElement("button");
    btn.classList.add("_collapse_debug");
    btn.textContent = "<<<";

    btn.addEventListener("click", () => {
      const panel: HTMLDivElement | null = document.querySelector(
        ".ccc-dev-panel-wrapper"
      );

      if (!panel) {
        return;
      }

      panel.classList.toggle("ccc-hide");
    });

    document.body.append(btn);
  }

  // * init panel
  static init() {
    this.crCollapseDebugPanelBtn();
    this.crDebugPanel();
  }

  static pingDebugPanel(payload: { payload: string | number | object }) {
    console.log("payload to ping", payload.payload);
    this.print(`${JSON.stringify(payload.payload)}\r\n`);
    this.pingElement.classList.add("_ping");

    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {
      this.pingElement.classList.remove("_ping");
    }, 500);
  }

  // * panel
  private static crDebugPanel(): void {
    this.debugPanel.classList.add("ccc-dev-panel-wrapper");
    this.debugPanel.append(
      this.panelButtons.crResetBtn(),
      this.panelButtons.crClearMovesTableBtn(),
      this.panelButtons.crLoadPGNBtn(),
      this.panelButtons.crNextMoveBtn(),
      this.panelButtons.crBookMovesBtn(),
      this.panelButtons.crCalcTranspositionsBtn(),
      this.panelButtons.crConsoleLogBtn(),
      this.crPageLogsBtn()
    );

    this.debugPanel.append(this.pingElement);
    this.pingElement.classList.add("_dev_ping_elem");

    document.body.appendChild(this.debugPanel);
  }

  // * ====================
  // * buttons creation
  private static crPageLogsBtn(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = "logs panel";

    if (!document.getElementById("_dev_logs_panel")) {
      this.logsHistoryContainer.classList.add("ccc-hide");
      document.body.appendChild(this.logsHistoryContainer);
    }

    btn.addEventListener("click", () => {
      this.logsHistoryContainer.classList.toggle("ccc-hide");
      if (!this.logsHistoryContainer.classList.contains("ccc-hide")) {
        const cacheHistory = this.logsHistoryContainer.querySelector(
          "._chess_cache_history"
        );

        if (cacheHistory) {
          this.logsHistoryContainer.removeChild(cacheHistory);
        }

        this.logsHistoryContainer.append(this.showChessCacheInHistoryLogs());
      }
    });

    return btn;
  }

  private static crLogsHistoryContainer() {
    if (this.logsHistoryContainer) {
      return;
    }

    this.logsHistoryContainer = document.createElement("div");

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "close";
    closeBtn.addEventListener("click", () => {
      this.logsHistoryContainer.classList.toggle("ccc-hide");
    });

    this.logsHistoryContainer.append(closeBtn);

    this.logsHistoryContainer.append(this.logsHistoryMainContent);
    this.logsHistoryContainer.id = "_dev_logs_panel";

    return this.logsHistoryContainer;
  }

  static print(content: string) {
    const div = document.createElement("div");
    div.textContent = content;

    this.logsHistoryMainContent.append(div);
  }

  private static showChessCacheInHistoryLogs() {
    const div = document.createElement("div");
    div.classList.add("_chess_cache_history");

    for (const entry of ChessGamesCache.cache.entries()) {
      const [gameNumber, cacheEntry] = entry;
      const { pgn } = cacheEntry;

      const pgnSlice = pgn.concat().slice(0, 24);

      const divInner = document.createElement("div");
      divInner.textContent = `${gameNumber}: ${JSON.stringify(pgnSlice)}`;

      div.appendChild(divInner);
    }

    const chessCurEl = document.createElement("div");
    const chessRevEl = document.createElement("div");

    const sl1 = chessCurrent.fields.pgn!.concat().filter((val, index) => {
      if (index > 25) {
        return;
      }
      return val;
    });
    const sl2 = chessReverse.fields.pgn!.concat().filter((val, index) => {
      if (index > 25) {
        return;
      }
      return val;
    });

    chessCurEl.textContent = `chessCur: ${JSON.stringify(sl1)}`;
    chessRevEl.textContent = `chessRev: ${JSON.stringify(sl2)}`;

    chessCurEl.style.backgroundColor = "firebrick";
    chessRevEl.style.backgroundColor = "firebrick";

    div.append(chessCurEl, chessRevEl);

    return div;
  }

  private static oldButtons() {
    class Buttons {
      private static moveIndex = 0;
      private static currentRow: HTMLTableRowElement;
      private static bookPlyLength = 16;

      // prettier-ignore
      private static pgnCurrent: readonly string[] = ["e4","Nf6","Nc3","d5","exd5","Nxd5","Bc4","Nb6","Bb3","Nc6","Nf3","Na5","d4","Nxb3","axb3","g6","O-O","Bg7","Re1","O-O","h3","Bf5","Bf4","c6","Ne2","Be4","Nd2","Bf5","c4","Re8","Nf3","Be4","Ne5","Nd7","Ng4","e5","dxe5","Bf5","Nh6+","Bxh6","Bxh6","Nxe5","Ng3","Qxd1","Rexd1","Bc2",
      ];

      // prettier-ignore
      private static pgnReverse: readonly string[] = [
        "e4","Nf6","Nc3","d5","exd5","Nxd5","Bc4","Nb6","Bb3","Nc6","Nf3","Na5","d4","Nxb3","axb3","g6","O-O","Bg7","h3","Bf5","Re1","O-O","Bf4","a5","Qd2","c6","Bh6","Bxh6","Qxh6","f6","Ne4","Rf7","Qd2","Bxe4","Rxe4","Nd7","b4","a4","Qe2","Nf8","c3","e6","Re3","b5","Nd2","Qd5","Ne4","Rd8","f4","Nd7","Re1","Re8","Qf2","f5","Nc5","Nxc5","dxc5","Rd7","h4","h5",
      ];

      static crBookMovesBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "play book moves";

        btn.addEventListener("click", (e) => {
          e.stopPropagation();

          this.playBookMoves();
        });

        return btn;
      }

      static crTableRow(moveNumber: number): HTMLTableRowElement {
        const row = document.createElement("tr");
        const rowHeader = document.createElement("th");

        // default row styling
        rowHeader.align = "right";
        rowHeader.classList.add("font-extra-faded-white");

        rowHeader.textContent = ` ${moveNumber}. `;

        row.append(rowHeader);

        return row;
      }

      static crMoveElement(index: number): HTMLTableCellElement {
        const cell = document.createElement("td");
        cell.textContent = ` ${this.pgnCurrent[index]} `;

        cell.classList.add("movetable-hoverable");
        if (index <= 15) {
          cell.classList.add("movetable-book-ply");
        }

        return cell;
      }

      static crLoadPGNBtn(): HTMLButtonElement {
        this.moveIndex = 0;

        const btn = document.createElement("button");
        btn.textContent = "load pgn";
        ``;

        btn.addEventListener("click", (e) => {
          e.stopPropagation();

          chessCurrent.actions.setPGN(this.pgnCurrent.concat());
          chessReverse.actions.setPGN(this.pgnReverse.concat());
        });

        return btn;
      }

      static crConsoleLogBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "click";

        btn.classList.add("_dev-log-btn");

        btn.addEventListener("click", (e) => {
          e.stopPropagation();

          Utils.log("debug logs", "orange");
          console.log("transpositions: ", FindTranspositions.transpositions);
          console.log("agree len: ", FindTranspositions.agreementLength);
          console.log("chess current :", chessCurrent);
          console.log("chess reverse :", chessReverse);
          console.log("game cache :", ChessGamesCache.cache);
        });

        return btn;
      }

      static crResetBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "reset all";

        btn.addEventListener("click", (e) => {
          this.moveIndex = 0;

          e.stopPropagation();

          FindTranspositions.reset();

          chessCurrent.actions.reset();
          chessReverse.actions.reset();

          // clear classes
          const moves = ExtractPageData.getMovesElements();

          moves.forEach((move) => {
            move.classList.remove("ccc-move-agree");
            move.classList.remove("ccc-data-move");
            move.removeAttribute("data-move");
          });
        });

        return btn;
      }

      static crClearMovesTableBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "delete moves";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();

          const gameResult = _DOM_Store.movesTableContainer.querySelector(
            ".movetable-gameResult"
          );
          if (gameResult) {
            _DOM_Store.movesTableContainer.removeChild(gameResult);
          }

          Utils.removeChildNodes(_DOM_Store.movesTable);
        });

        return btn;
      }

      static crCalcTranspositionsBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "find transpositions";

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          console.log("not implemented");
        });

        return btn;
      }

      static crNextMoveBtn(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = "next move";

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.makeNextMove();
        });

        return btn;
      }
      // * ====================
      // * button methods
      private static playBookMoves(): void {
        for (let i = 0; i < this.bookPlyLength; i++) {
          this.makeNextMove();
        }
      }

      private static makeNextMove(): void {
        if (!this.pgnCurrent[this.moveIndex]) {
          return;
        }

        if (this.moveIndex % 2 === 0) {
          this.currentRow = this.crTableRow(Math.floor(this.moveIndex / 2) + 1);
          _DOM_Store.movesTable.append(this.currentRow);
        }
        const moveElement = this.crMoveElement(this.moveIndex);

        this.currentRow.appendChild(moveElement);

        this.moveIndex++;
      }
    }
    return Buttons;
  }
}
