// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomCrosstable {
  static cssClasses = {
    backdrop: "_dev_modal-backdrop",
    content: "_dev_modal-content",
    table: "_dev_modal-table",
    row: "_dev_modal-row",
    //
    h2hCell: "_dev-head-to-head",
    scoreWrapper: "_dev_modal-score-wrapper",
    resultsGrid: "_dev_modal-results-grid",
    crosstableOptionsWrapper: "ccc-options-wrapper_dev",
    gamePairWrapper: "ccc-custom-table_pair-wrapper",
  } as const;

  static crCustomCrosstableButton() {
    const btn = document.createElement("button");
    btn.textContent = "dev crosstable";

    btn.classList.add("_dev_fast_crosstable-btn");

    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();

      const existingCrosstable = document.querySelector(
        `.${this.cssClasses.backdrop}`
      );

      if (existingCrosstable) {
        document.body.removeChild(existingCrosstable);
      } else {
        this.crCustomCrosstable();
      }
    });

    document.body.append(btn);
  }

  private static crModalBackdrop() {
    const modalBackdrop = document.createElement("div");
    modalBackdrop.classList.add(this.cssClasses.backdrop);

    modalBackdrop.addEventListener("click", (e) => {
      const target = e.target as Element;

      if (
        target?.classList?.contains(this.cssClasses.content) ||
        target?.classList?.contains(this.cssClasses.crosstableOptionsWrapper) ||
        target?.classList?.contains("ccc-label") ||
        target?.classList?.contains("ccc-form") ||
        target?.classList?.contains("ccc-row-input") ||
        target?.classList?.contains("ccc-input")
      ) {
        return;
      }

      document.body.removeChild(modalBackdrop);
    });

    return modalBackdrop;
  }

  private static crCustomCrosstable() {
    const modalBackdrop = this.crModalBackdrop();
    const modal = this.crContentWrapper();
    const table = this.crTable();

    const currentEvent = _dev_EventState.getCurrentEvent();

    if (!currentEvent) {
      return;
    }

    const { crosstable } = currentEvent;
    const { standings } = currentEvent.standings;

    console.log("full crosstable", crosstable);
    console.log("state", currentEvent);

    const firstRow = this.crTableRow();
    firstRow.style.background = "#1E1D1A";

    for (let i = 0; i < standings.length; i++) {
      const cur = standings[i];

      if (i === 0) {
        const th1 = document.createElement("th");
        th1.colSpan = 2;
        const th2 = document.createElement("th");
        th2.textContent = "Total";

        firstRow.append(th1, th2);
      }

      const th = document.createElement("th");
      th.textContent = `${i + 1} ${cur.name}`;

      firstRow.append(th);
    }

    table.append(firstRow);

    for (let i = 0; i < standings.length; i++) {
      const engine = standings[i];
      const headToHeadInfo = crosstable[engine.name];

      const row = this.crTableRow();

      const rankCell = document.createElement("td");
      rankCell.textContent = `${i + 1}`;

      const engineNameCell = document.createElement("td");
      engineNameCell.textContent = `${standings[i].name}`;

      const scoreCell = document.createElement("td");
      scoreCell.textContent = `${engine.score}`;

      row.append(rankCell, engineNameCell, scoreCell);

      for (let j = 0; j < standings.length; j++) {
        const opponent = standings[j];
        const headToHeadCell = this.crH2HCell();
        const opponentMatches = headToHeadInfo[opponent.name] as
          | chess_com.crosstable_h2h_results
          | undefined;

        if (engine.engineid === opponent.engineid) {
          // todo add an option to create an empty cell
          headToHeadCell.classList.add("_dev_modal-empty");
          row.append(headToHeadCell);

          continue;
        }

        const colResultsWrapper = this.crH2HResultsWrapper();

        const resAsScore = this.getResultAsScore(opponentMatches?.results);
        const [ptnml, wdl] = CrosstableHelper.calculateStats(resAsScore);

        const ptnmlEl = components.CrossTable.crPTNMLStatElement(ptnml);
        const eloEl = components.CrossTable.crWDLEloStatElement(wdl);

        const ptnmlAction = UserSettings.customSettings["ptnml"]
          ? "remove"
          : "add";
        ptnmlEl.classList[ptnmlAction]("ccc-display-none");

        const eloAction = UserSettings.customSettings["elo"] ? "remove" : "add";
        ptnmlEl.classList[eloAction]("ccc-display-none");

        const scoreWrapper = this.crH2HScoreWrapper(
          opponentMatches?.p1Score,
          opponentMatches?.p2Score,
          opponentMatches?.margin
        );
        headToHeadCell.append(scoreWrapper, ptnmlEl, eloEl, colResultsWrapper);

        if (opponentMatches?.results) {
          const { results } = opponentMatches;
          for (let i = 0; i < results.length; i += 2) {
            const result1 = results[i];
            const result2 = results[i + 1];

            const gamePairElem = document.createElement("div");

            const gameResult1 = document.createElement("div");
            const gameResult2 = document.createElement("div");

            gameResult1.textContent = result1.r;
            gameResult2.textContent = result2?.r || "";

            gamePairElem.append(gameResult1, gameResult2);

            gamePairElem.classList.add(this.cssClasses.gamePairWrapper);

            if (!result2) {
              colResultsWrapper.append(gamePairElem);
              break;
            }

            const scoreArr = this.getResultAsScore([
              results[i],
              results[i + 1],
            ]);
            const pairScore = scoreArr[0] + scoreArr[1];

            if (pairScore === 2) {
              gamePairElem.classList.add("ccc-double-win");
            } else if (pairScore === 1) {
              gamePairElem.classList.add("ccc-win");
            } else if (pairScore === 0) {
              gamePairElem.classList.add("ccc-draw");
            } else if (pairScore === -1) {
              gamePairElem.classList.add("ccc-loss");
            } else {
              gamePairElem.classList.add("ccc-double-loss");
            }

            colResultsWrapper.append(gamePairElem);
          }
        }

        row.append(headToHeadCell);
      }

      table.append(row);
    }

    const settingsWrapper = document.createElement("div");
    settingsWrapper.classList.add(this.cssClasses.crosstableOptionsWrapper);

    const form = components.CrossTable.crPairsPerRowForm();
    const eloLabel = components.CrossTable.crSettingsSwitch(
      "WDL + Elo",
      "elo",
      true
    );
    const ptnmlLabel = components.CrossTable.crSettingsSwitch(
      "Ptnml",
      "ptnml",
      true
    );

    eloLabel.addEventListener("change", () => {
      const eloAction = UserSettings.customSettings["elo"] ? "remove" : "add";

      const eloElList = modal.querySelectorAll(
        ".ccc-stat-wrapper.ccc-wdl-wrapper"
      );

      for (let i = 0; i < eloElList.length; i++) {
        eloElList[i].classList[eloAction]("ccc-display-none");
      }
    });

    ptnmlLabel.addEventListener("change", () => {
      const ptnmlAction = UserSettings.customSettings["ptnml"]
        ? "remove"
        : "add";

      const ptnmlElList = modal.querySelectorAll(
        ".ccc-stat-wrapper.ccc-ptnml-wrapper"
      );

      for (let i = 0; i < ptnmlElList.length; i++) {
        ptnmlElList[i].classList[ptnmlAction]("ccc-display-none");
      }
    });

    settingsWrapper.append(form, eloLabel, ptnmlLabel);

    modal.append(table, settingsWrapper);
    modalBackdrop.append(modal);
    document.body.append(modalBackdrop);
  }

  private static crContentWrapper() {
    const modalContentWrapper = document.createElement("div");
    modalContentWrapper.classList.add(this.cssClasses.content);

    return modalContentWrapper;
  }

  private static crTable() {
    const table = document.createElement("table");
    table.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    table.classList.add(this.cssClasses.table);

    return table;
  }

  private static crTableRow() {
    const row = document.createElement("tr");
    row.classList.add(this.cssClasses.row);

    return row;
  }

  private static crH2HCell() {
    const col = document.createElement("td");
    col.classList.add(this.cssClasses.h2hCell);

    return col;
  }

  private static crH2HScoreWrapper(
    score1: number | undefined,
    score2: number | undefined,
    margin: number | undefined
  ) {
    const wrapper = document.createElement("div");
    wrapper.classList.add(this.cssClasses.scoreWrapper);

    const p1Score = document.createElement("div");
    const p2Score = document.createElement("div");
    const divider = document.createElement("div");
    divider.textContent = "-";

    const diff = document.createElement("div");

    p1Score.textContent = `${score1 ?? NaN}`;
    p2Score.textContent = `${score2 ?? NaN}`;

    const sign = margin === undefined ? "NaN" : margin > 0 ? "+" : "";
    diff.textContent = margin === undefined ? "NaN" : `[${sign}${margin}]`;

    if (margin !== undefined) {
      if (margin > 0) {
        diff.classList.add("ccc-res-win");
      } else if (margin < 0) {
        diff.classList.add("ccc-res-loss");
      }
    }

    wrapper.append(p1Score, divider, p2Score, diff);

    return wrapper;
  }

  private static crH2HResultsWrapper() {
    const resultsWrapper = document.createElement("div");

    resultsWrapper.classList.add(this.cssClasses.resultsGrid);

    return resultsWrapper;
  }

  private static getResultAsScore(
    matchScores: chess_com.crosstable_h2h_results["results"] | undefined | null
  ): ResultAsScore[] {
    if (matchScores === null || matchScores === undefined) {
      return [];
    }

    const arr: ResultAsScore[] = new Array(matchScores.length).fill(0);

    matchScores.forEach((el, index) => {
      if (el.r === "0") {
        arr[index] = -1;
      } else if (el.r === "1") {
        arr[index] = 1;
      }
    });

    return arr;
  }
}
