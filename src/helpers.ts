/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

namespace dom_elements {
  /**
   * provides methods for creating crosstable elements
   */
  export class CrossTable {
    static crExtensionSettingsBtn() {
      const extensionSettingsBtn = document.createElement("button");
      const gearSVG = SVG.Icons.gear;

      extensionSettingsBtn.title = "Extension settings";

      extensionSettingsBtn.classList.add("ccc-extension-settings-btn");
      extensionSettingsBtn.append(gearSVG);

      extensionSettingsBtn.addEventListener("click", () => {
        dom_elements.CrossTable.crExtensionSettingsModal();
      });

      return extensionSettingsBtn;
    }

    private static crExtensionSettingsModal() {
      const crossTableModal = document.querySelector(
        ".modal-vue-modal-content"
      )!;

      const modalBackdrop = document.createElement("div");
      const modalWrapper = document.createElement("div");

      modalBackdrop.classList.add("ccc-options-backdrop");
      modalWrapper.classList.add("ccc-options-modal");

      modalBackdrop.append(modalWrapper);

      modalBackdrop.addEventListener(
        "click",
        () => {
          // document.body.removeChild(modalBackdrop);
          crossTableModal.removeChild(modalBackdrop);
        },
        { once: true }
      );

      modalWrapper.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // ! mock
      // ! mock
      // ! mock
      const option_1 = this.crExtensionSettingRow(
        "displayEngineNames",
        "engine names"
      );
      const option_2 = this.crExtensionSettingRow(
        "addLinksToGameSchedule",
        "links to schedule"
      );
      const option_3 = this.crExtensionSettingRow(
        "materialCount",
        "material count"
      );
      const option_4 = this.crExtensionSettingRow(
        "replaceClockSvg",
        "replace clock"
      );
      const option_5 = this.crExtensionSettingRow(
        "allowKeyboardShortcuts",
        "keyboard shortcuts"
      );

      modalWrapper.append(option_1, option_2, option_3, option_4, option_5);

      crossTableModal.append(modalBackdrop);
    }

    private static crExtensionSettingRow<T extends BooleanKeys<UserSettings>>(
      key: T,
      description: string
    ) {
      const row = document.createElement("div");
      row.classList.add("_row");

      const descriptionElem = document.createElement("p");
      descriptionElem.classList.add("_desc");

      descriptionElem.textContent = description;

      const input = document.createElement("input");
      input.classList.add("ccc-input");
      input.tabIndex = 1000;

      input.type = "checkbox";
      input.checked = userSettings[key] ?? _State.userSettingsDefault[key];

      input.addEventListener("change", () => {
        userSettings[key] = !userSettings[key];
        ExtensionHelper.localStorage.setState(key, userSettings[key]);

        ExtensionHelper.applyUserSettings(key);
      });

      row.append(descriptionElem, input);

      return row;
    }

    static crEngineNames() {
      const engines = document.querySelectorAll(".crosstable-name");

      if (!engines) return;

      const enginesNames: string[] = [];
      engines.forEach((engine) => {
        enginesNames.push(engine.textContent!.replace("\n", "").trim());
      });

      const crossTable = document.querySelector(".crosstable-crosstable");
      if (!crossTable) return;

      const standingsRow = crossTable.querySelector("tr")!;
      const enginesRows = standingsRow.querySelectorAll(
        ".font-extra-faded-white"
      );

      enginesRows.forEach((row, index) => {
        row.textContent = `${index + 1} ${enginesNames[index]}`;
      });
    }

    static crPTNMLStat(ptnml: PTNML) {
      const ptnmlWrapper = this.crStatWrapperElement();
      ptnmlWrapper.classList.add("ccc-ptnml-wrapper");

      const ptnmlElement = document.createElement("div");
      const ptnmlHeader = document.createElement("div");

      ptnmlHeader.id = "ptnml-header";
      ptnmlHeader.textContent = "Ptnml(0-2)";

      ptnmlHeader.title = " LL, LD, WL/DD, WD, WW ";
      this.crPTNMLEntries(ptnmlElement, ptnml);

      ptnmlElement.classList.add("ccc-ptnml");

      ptnmlWrapper.append(ptnmlHeader, ptnmlElement);

      return ptnmlWrapper;
    }

    static crWDLStat(wdlArray: WDL) {
      const wdlWrapper = this.crStatWrapperElement();
      wdlWrapper.classList.add("ccc-wdl-wrapper");

      const [wdlElement, eloElement] = this.crWLDEloElement(wdlArray);

      wdlWrapper.append(wdlElement);
      if (eloElement) {
        wdlWrapper.append(eloElement);
      }
      return wdlWrapper;
    }

    static crSettingsSwitch(text: string, field: BooleanKeys<UserSettings>) {
      const label = document.createElement("label");
      const switchInput = document.createElement("input");

      label.classList.add("ccc-label");
      label.textContent = `${text}:`;
      label.setAttribute("data-name", field);

      label.htmlFor = `id-${field}`;
      switchInput.id = label.htmlFor;

      switchInput.classList.add("ccc-input");
      switchInput.type = "checkbox";

      switchInput.checked = userSettings[field] ?? true;

      label.append(switchInput);

      return label;
    }

    /**
     *  creates SVG caret that opens the additional stats modal
     */
    static crAdditionalStatCaret(
      stats: AdditionalStats,
      index_1: number,
      index_2: number
    ) {
      const additionalStatsBtn = document.createElement("div");
      additionalStatsBtn.classList.add("ccc-info-button");

      const caretSVG = SVG.Icons.caretDown;
      additionalStatsBtn.append(caretSVG);

      additionalStatsBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        const statsElementBackdrop = document.createElement("div");
        statsElementBackdrop.classList.add("ccc-info-backdrop");

        statsElementBackdrop.addEventListener("click", function (e) {
          e.stopPropagation();
          if (e.target !== statsElementBackdrop) return;
          additionalStatsBtn.removeChild(statsElementBackdrop);
        });

        const infoElement = this.crAdditionalStatContent(
          stats,
          index_1,
          index_2
        );

        statsElementBackdrop.append(infoElement);
        additionalStatsBtn.append(statsElementBackdrop);
      });

      return additionalStatsBtn;
    }

    /**
     * creates form element that controls
     * amount of game pairs per row
     *
     * selectors: `ccc-form` & `ccc-row-input`
     */
    static crPairsPerRowForm() {
      const formElement = document.createElement("form");
      const rowAmountInput = document.createElement("input");

      formElement.classList.add("ccc-form");
      rowAmountInput.classList.add("ccc-row-input");

      formElement.textContent = `Pairs per row`;

      rowAmountInput.type = "number";
      rowAmountInput.min = "0";
      rowAmountInput.value = `${
        enginesAmount === 2
          ? userSettings.pairsPerRowDuel
          : userSettings.pairsPerRow
      }`;
      formElement.append(rowAmountInput);

      formElement.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = rowAmountInput.valueAsNumber;
        document.body.style.setProperty(
          "--custom-column-amount",
          `${value ? value * 2 : ""}`
        );

        if (enginesAmount === 2) {
          ExtensionHelper.localStorage.setState("pairsPerRowDuel", value || "");
          userSettings.pairsPerRowDuel = value;
        } else {
          ExtensionHelper.localStorage.setState("pairsPerRow", value || "");
          userSettings.pairsPerRow = value;
        }
      });

      return formElement;
    }

    /**
     * creates all additional stat entries and puts them
     * into container
     */
    private static crAdditionalStatContent(
      stats: AdditionalStats,
      index_1: number,
      index_2: number
    ) {
      const mainContainer = document.createElement("div");
      mainContainer.classList.add("ccc-info-panel");
      mainContainer.innerHTML = "";

      const waveContainer = dom_elements.Wrappers.crWaveWrapper();

      mainContainer.append(waveContainer);

      const p1 = this.crStatRow(
        "Longest lossless streak: ",
        `${stats.longestLossless} pairs`
      );
      const p2 = this.crStatRow(
        "Longest win streak: ",
        `${stats.longestWinStreak} pairs`
      );
      const p3 = this.crStatRow(
        "Longest winless streak: ",
        `${stats.longestWinless} pairs`
      );

      const p4 = this.crStatRow(
        "Performance: ",
        `${formatter.format(stats.performancePercent)}%`
      );
      const p5 = this.crStatRow(
        "Pairs Ratio: ",
        `${stats.pairsWL[0]} / ${stats.pairsWL[1]} = ${formatter.format(
          stats.pairsRatio
        )}`
      );

      const p6 = this.crStatRow("Highest score: ", `[+${stats.highestScore}]`);

      const opponentsDiv = document.createElement("div");
      opponentsDiv.classList.add("ccc-opponents-div");

      const pElem = document.createElement("p");
      pElem.textContent = "vs";

      const img_1 = document.createElement("img");
      const img_2 = document.createElement("img");

      img_1.src = engineImages![index_1]!.src;
      img_1.alt = engineImages![index_1]!.alt;

      img_2.src = engineImages![index_2]!.src;
      img_2.alt = engineImages![index_2]!.alt;

      opponentsDiv.append(img_2, pElem, img_1);

      const wrapper = document.createElement("div");
      wrapper.classList.add("ccc-info-main");

      wrapper.append(opponentsDiv);
      wrapper.append(
        p1,
        p2,
        p3,
        p5,
        p4
        //  p6
      );
      mainContainer.append(wrapper);

      return mainContainer;
    }

    /**
     * creates row with 100% width for PTNML or Elo stat
     */
    private static crStatRow(info: string, stat: string) {
      const row = document.createElement("div");
      const pInfo = document.createElement("p");
      const pStat = document.createElement("p");

      row.classList.add("ccc-stat-row");
      pInfo.classList.add("ccc-stat-info-text");
      pStat.classList.add("ccc-stat-info-stat");

      pInfo.textContent = info;
      pStat.textContent = stat;

      row.append(pInfo, pStat);
      return row;
    }

    private static crPTNMLEntries(element: HTMLDivElement, ptnml: PTNML) {
      const ll = document.createElement("p");
      const ld = document.createElement("p");
      const wldd = document.createElement("p");
      const wd = document.createElement("p");
      const ww = document.createElement("p");

      ll.textContent = `${ptnml[0]},`;
      ll.title = "L+L";

      ld.textContent = `${ptnml[1]},`;
      ld.title = "L+D";

      wldd.textContent = `${ptnml[2]},`;
      wldd.title = "W+L / D+D";

      wd.textContent = `${ptnml[3]},`;
      wd.title = "W+D";

      ww.textContent = `${ptnml[4]}`;
      ww.title = "W+W";

      element.append(ll, ld, wldd, wd, ww);
    }

    /**
     * creates elo and elo-error margin element
     */
    private static crEloAndMarginElement(elo: string, margin: string) {
      const wrapper = document.createElement("div");
      const eloElement = document.createElement("p");
      const marginElement = document.createElement("p");

      wrapper.classList.add("ccc-elo-wrapper");

      eloElement.classList.add("ccc-elo");
      eloElement.classList.add(parseInt(elo) >= 0 ? "win" : "ccc-elo-negative");

      eloElement.textContent = `${elo}`;

      marginElement.textContent = `${margin}`;
      marginElement.title = "2 sigma confidence interval";
      marginElement.classList.add("ccc-error-margin");

      wrapper.append(eloElement, marginElement);

      return wrapper;
    }

    /**
     * creates WDL + ELO element
     */
    private static crWLDEloElement(wdl: WDL) {
      const numberOfGames = wdl.reduce((amount, prev) => amount + prev, 0);

      const wdlElement = document.createElement("div");
      wdlElement.classList.add("ccc-wdl-container");

      const w = document.createElement("p");
      const d = document.createElement("p");
      const l = document.createElement("p");

      w.textContent = `+${wdl[0]}`;
      d.textContent = `=${wdl[1]}`;
      l.textContent = `-${wdl[2]} `;

      // default CCC styles
      w.classList.add("win");
      d.classList.add("draw");

      l.classList.add("loss");
      l.classList.add("ccc-margin-right");

      const points = wdl[0] + wdl[1] / 2;

      const percent = formatter.format((points / numberOfGames) * 100);

      let elo;
      let margin;
      let eloWrapper;

      if (numberOfGames >= 2) {
        elo = ELOCalculation.calculateEloFromPercent(parseFloat(percent));
        margin = ELOCalculation.calculateErrorMargin(wdl[0], wdl[1], wdl[2]);
        eloWrapper = this.crEloAndMarginElement(elo, margin);
      }

      wdlElement.append(w, d, l);

      return [wdlElement, eloWrapper] as const;
    }

    /**
     * creates containers for `PTNML` / `Elo` elements
     */
    private static crStatWrapperElement() {
      const wrapper = document.createElement("div");
      wrapper.classList.add("ccc-stat-wrapper");

      return wrapper;
    }

    // private static crExtensionSettingsModal() {
    //   const modalBackdrop = document.createElement("div");
    //   const modal = document.createElement("div");

    //   modalBackdrop.classList.add("ccc-options-backdrop");
    //   modal.classList.add("ccc-options-modal");

    //   modalBackdrop.append(modal);

    //   modalBackdrop.addEventListener(
    //     "click",
    //     () => {
    //       document.body.removeChild(modalBackdrop);
    //     },
    //     { once: true }
    //   );

    //   modal.addEventListener("click", (e) => {
    //     e.stopPropagation();
    //   });

    //   document.body.append(modalBackdrop);
    // }
  }

  export class Wrappers {
    static crWaveWrapper() {
      const waveContainer = document.createElement("div");
      const waveFiller = document.createElement("div");
      const wave = document.createElement("div");

      const xMarkButton = document.createElement("button");
      const xMarkSVG = SVG.Icons.xMark;

      xMarkButton.append(xMarkSVG);
      xMarkButton.classList.add("ccc-x-mark");

      waveFiller.append(xMarkButton);

      xMarkButton.addEventListener("click", (e) => {
        e.stopPropagation();

        const statsModal = document.querySelector(".ccc-info-backdrop");
        if (!statsModal) return;
        const infoBtn = statsModal.parentNode;
        infoBtn?.removeChild(statsModal);
      });

      waveContainer.classList.add("ccc-wave-container");
      waveFiller.classList.add("ccc-wave-filler");
      wave.classList.add("ccc-wave");
      const waveSVG = SVG.Icons.wave;
      wave.append(waveSVG);

      waveContainer.append(waveFiller, wave);
      return waveContainer;
    }

    /**
     * creates wrapper for captured pieces SVGs
     *
     * selector: `.ccc-captured-pieces-wrapper`
     */
    static crMaterialCountWrapper() {
      const div = document.createElement("div");
      div.classList.add("ccc-captured-pieces-wrapper");
      return div;
    }
  }

  // =========
  // helper functions

  /**
   * removes the passed node from the DOM tree
   * @param {HTMLGenericNode} nodeToRemove
   */
  export function removeNode(nodeToRemove: HTMLGenericNode) {
    nodeToRemove.parentNode?.removeChild(nodeToRemove);
  }

  /**
   * removes all children from the passed node
   * @param {HTMLGenericNode} node
   */
  export function removeAllChildNodes(node: HTMLGenericNode) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
}

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

    protected static createSVG(options: Partial<SVGOption>) {
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

    protected static createPath(options: Partial<SVGOption>) {
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
    static get w_pawn() {
      return this.createPawn("white");
    }

    static get w_bishop() {
      return this.createBishop("white");
    }

    static get w_knight() {
      return this.createKnight("white");
    }

    static get w_rook() {
      return this.createRook("white");
    }

    static get w_queen() {
      // separate method was needed to create the white queen
      const svg = this.createSVG({
        width: "34",
        height: "31",
        viewBox: "0 0 34 31",
        fill: "none",
      });

      this.createPath({
        d: "M25.6651 27.2429C30.0393 27.2429 30.2301 30.4857 30.2301 32.8932H7.51483C7.51483 30.4366 7.70149 27.2429 12.0757 27.2429H25.6651Z",
        fill: "white",
        stroke: "black",
        strokeWidth: "1.51181",
      });

      this.createPath({
        d: "M15.0138 3.87296C14.6176 3.87269 14.2252 3.95051 13.859 4.10196C13.4929 4.25341 13.1602 4.47552 12.8799 4.7556C12.5996 5.03569 12.3773 5.36825 12.2256 5.7343C12.0739 6.10034 11.9959 6.49269 11.9959 6.88892C11.9962 7.49395 12.1786 8.08488 12.5192 8.58493C12.8598 9.08497 13.3429 9.47101 13.9058 9.69288L13.5328 17.8088L9.54888 11.2849C9.89435 10.7819 10.0791 10.186 10.0789 9.57588C10.0787 9.17982 10.0006 8.78766 9.84892 8.4218C9.69723 8.05594 9.47496 7.72354 9.19481 7.44357C8.91466 7.1636 8.58211 6.94156 8.21615 6.79012C7.85018 6.63867 7.45798 6.56079 7.06191 6.56092C6.26238 6.56119 5.49566 6.87892 4.93031 7.44428C4.36495 8.00963 4.04722 8.77635 4.04695 9.57588C4.04748 10.2866 4.29898 10.9743 4.7571 11.5177C5.21522 12.0611 5.85051 12.4252 6.55092 12.5458L11.3239 27.2357H26.4707L31.2306 12.6358C31.9497 12.5345 32.608 12.1771 33.0847 11.6293C33.5614 11.0815 33.8245 10.3801 33.8256 9.65388C33.8253 8.85435 33.5076 8.08763 32.9422 7.52228C32.3769 6.95692 31.6102 6.63919 30.8106 6.63892C30.0109 6.63892 29.2439 6.95654 28.6784 7.52192C28.1128 8.08731 27.7949 8.85417 27.7947 9.65388C27.7963 10.2139 27.9539 10.7624 28.2496 11.2379L24.1777 17.8078L23.8587 9.67988C24.413 9.45335 24.8873 9.06696 25.2212 8.56992C25.5551 8.07289 25.7335 7.4877 25.7337 6.88892C25.7337 6.08921 25.4161 5.32224 24.8507 4.75666C24.2853 4.19109 23.5184 3.87322 22.7187 3.87296C21.9188 3.87296 21.1517 4.19071 20.5861 4.75631C20.0205 5.32191 19.7028 6.08904 19.7028 6.88892C19.7027 7.67437 20.0091 8.42885 20.5567 8.99189L18.8548 17.8088L17.2298 8.92889C17.7428 8.37325 18.0283 7.64516 18.0298 6.88892C18.0298 6.08904 17.712 5.32191 17.1464 4.75631C16.5808 4.19071 15.8137 3.87296 15.0138 3.87296Z",
        fill: "white",
        stroke: "black",
        strokeWidth: "1.51179",
      });

      return svg;
    }

    // * black pieces
    static get b_pawn() {
      return this.createPawn("black");
    }

    static get b_bishop() {
      return this.createBishop("black");
    }

    static get b_knight() {
      return this.createKnight("black");
    }

    static get b_rook() {
      return this.createRook("black");
    }

    static get b_queen() {
      return this.createQueen("black");
    }

    // *
    private static createPawn(color: PieceColor) {
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

    private static createBishop(color: PieceColor) {
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

    private static createKnight(color: PieceColor) {
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

    private static createRook(color: PieceColor) {
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

    private static createQueen(color: PieceColor) {
      const fillColor = this.getFillColor(color);

      const svg = this.createSVG({
        width: "30",
        height: "30",
        viewBox: "0 0 30 30",
      });

      this.createPath({
        d: "M21.6651 24.2429C26.0393 24.2429 26.2301 27.4857 26.2301 29.8932H3.51483C3.51483 27.4366 3.70149 24.2429 8.07573 24.2429H21.6651Z",
        fill: fillColor,
      });

      this.createPath({
        d: "M11.0135 0.877808C10.2146 0.877807 9.44838 1.17477 8.88309 1.70343C8.31781 2.23208 7.99969 2.94921 7.99863 3.69734C7.99923 4.26317 8.18138 4.81582 8.52144 5.28353C8.86151 5.75124 9.3438 6.11243 9.90576 6.32034L9.53245 13.9172L5.54775 7.81321C5.89284 7.34139 6.07679 6.78264 6.07526 6.21076C6.07419 5.46329 5.75663 4.74666 5.19222 4.21811C4.62781 3.68957 3.86261 3.39223 3.06441 3.39123C2.26551 3.39122 1.49927 3.68807 0.933984 4.21673C0.368696 4.74538 0.0505843 5.46263 0.0495148 6.21076C0.0496864 6.87641 0.301008 7.52061 0.759105 8.02959C1.2172 8.53857 1.85261 8.87958 2.55314 8.99246L7.32504 22.7348H22.4726L27.2323 9.07563C27.9513 8.98139 28.6097 8.64731 29.0868 8.1349C29.5639 7.62249 29.8275 6.96613 29.8293 6.28631C29.8293 5.91523 29.7511 5.54777 29.5994 5.20498C29.4476 4.86219 29.2252 4.5508 28.9448 4.28859C28.6644 4.02637 28.3316 3.81847 27.9653 3.67681C27.599 3.53515 27.2066 3.46247 26.8103 3.46297C26.0107 3.46297 25.2438 3.7605 24.6784 4.28997C24.113 4.81944 23.7954 5.53752 23.7954 6.28631C23.7972 6.81008 23.9546 7.32306 24.2499 7.76788L20.18 13.9134L19.8594 6.30903C20.4127 6.09734 20.8864 5.73634 21.2202 5.27199C21.554 4.80765 21.7329 4.2609 21.7341 3.70115C21.7341 2.95236 21.4164 2.23417 20.851 1.70469C20.2856 1.17522 19.5188 0.877808 18.7192 0.877808C17.9203 0.877807 17.154 1.17477 16.5887 1.70343C16.0235 2.23208 15.7053 2.94921 15.7043 3.69734C15.7047 4.43128 16.0104 5.13616 16.5564 5.66266L14.8562 13.9134L13.2331 5.60602C13.7441 5.0855 14.0279 4.40438 14.0284 3.69734C14.0274 2.94921 13.7092 2.23208 13.144 1.70343C12.5787 1.17477 11.8124 0.877807 11.0135 0.877808Z",
        fill: fillColor,
      });

      return svg;
    }

    // *
    private static getFillColor(color: PieceColor) {
      const fillColor: SVGColors = color === "white" ? "white" : "black";
      return fillColor;
    }

    private static getStrokeColor(color: PieceColor) {
      const strokeColor: SVGColors = color === "white" ? "black" : "#CBCACA";
      return strokeColor;
    }
  }

  export class Icons extends SVGBase {
    static get caretDown() {
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

    static get wave() {
      const svg = this.createSVG({
        viewBox: "0 0 1200 120",
      });

      this.createPath({
        d: "M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z",
      });

      return svg;
    }

    static get xMark() {
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

    static get clock() {
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

    static get flask() {
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

    static get gear() {
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

namespace stats_helpers {
  const PairsObj = {
    DoubleWin: "ccc-double-win",
    Win: "ccc-win",
    Draw: "ccc-draw",
    Loss: "ccc-loss",
    DoubleLoss: "ccc-double-loss",
  } as const;

  /**
   * calculates WDL, ELO and all additional stats
   */
  export function calculateStats(scoresArray: ResultAsScore[]) {
    const wdlArray: WDL = [0, 0, 0]; // [W D L] in that order
    scoresArray.forEach((score) => {
      // score is either 1 0 -1
      // so by doing this we automatically
      // increment correct value
      wdlArray[1 - score] += 1;
    });

    // get rid of an unfinished game pair
    if (scoresArray.length % 2 === 1) scoresArray.pop();
    const ptnml: PTNML = [0, 0, 0, 0, 0]; // ptnml(0-2)

    const stats: AdditionalStats = {
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
      const cur = scoresArray[i]!;

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
      const first = scoresArray[i]!;
      const second = scoresArray[i + 1]!;
      const res = first + second;

      if (res === 2) {
        ptnml[4] += 1;

        longesLosslessCurrent += 1;
        longestWinCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinlessCurrent = 0;
      } else if (res === 1) {
        ptnml[3] += 1;

        longesLosslessCurrent += 1;
        longestWinCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinlessCurrent = 0;
      } else if (res === 0) {
        ptnml[2] += 1;
        longesLosslessCurrent += 1;
        longestWinlessCurrent += 1;

        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinCurrent = 0;
      } else if (res === -1) {
        ptnml[1] += 1;
        longestWinlessCurrent += 1;

        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

        // reset
        longestWinCurrent = 0;
        longesLosslessCurrent = 0;
      } else {
        ptnml[0] += 1;
        longestWinlessCurrent += 1;

        longesLosslessRecord = Math.max(
          longesLosslessCurrent,
          longesLosslessRecord
        );
        longestWinRecord = Math.max(longestWinCurrent, longestWinRecord);
        longestWinlessRecord = Math.max(
          longestWinlessCurrent,
          longestWinlessRecord
        );

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

    return [ptnml, wdlArray, stats] as const;
  }

  /** gets scores from a NodeList and returns them as an array */
  export function getScoresFromList(
    gameResultElementList: NodeListOf<HTMLDivElement>
  ) {
    const scoresArray: ResultAsScore[] = [];

    gameResultElementList.forEach((result) => {
      scoresArray.push(getResultFromNode(result));
    });

    return scoresArray;
  }

  /**
   * todo change description
   */
  export function paintGamePairs(
    gameResultList: NodeListOf<HTMLDivElement>,
    scoresArray: ResultAsScore[],
    pairsPerRow: number
  ) {
    gameResultList.forEach((elem, index) => {
      elem.id = "ccc-result";

      const isEven = index % 2 === 0;
      const temp = index % (pairsPerRow * 2) === 0;
      const isFirstElementInRow = isEven && temp;

      if (!isEven) {
        elem.classList.add("ccc-border-right");

        const className = getClassNameForPair(
          scoresArray[index - 1],
          scoresArray[index]
        );

        elem.classList.add(className);
        gameResultList[index - 1].classList.add(className);
      } else if (isFirstElementInRow || pairsPerRow === 1) {
        elem.classList.add("ccc-border-left");
      }
    });
  }

  function getResultFromNode(node: HTMLDivElement) {
    if (node.classList.contains("win")) return 1;
    if (node.classList.contains("draw")) return 0;
    return -1;
  }

  function getClassNameForPair(
    lastResult: ResultAsScore,
    currentResult: ResultAsScore
  ) {
    const pairScore = lastResult + currentResult;

    if (pairScore === 2) return PairsObj.DoubleWin;
    if (pairScore === 1) return PairsObj.Win;
    if (pairScore === 0) return PairsObj.Draw;
    if (pairScore === -1) return PairsObj.Loss;
    return PairsObj.DoubleLoss;
  }
}

namespace ExtensionHelper {
  export class localStorage {
    static getState<T extends keyof UserSettings>(keys: T | T[]) {
      return browserPrefix.storage.local.get(keys) as Promise<
        Pick<UserSettings, T>
      >;
    }

    static setState<K extends keyof UserSettings, V extends UserSettings[K]>(
      key: K,
      value: V
    ) {
      return browserPrefix.storage.local.set({ [key]: value });
    }

    static setStateObj<T extends Partial<UserSettings>>(obj: T) {
      return browserPrefix.storage.local.set(obj);
    }
  }

  export class messages {
    static sendMessage(message: message_pass.message) {
      // @ts-ignore
      return browserPrefix.runtime.sendMessage(message) as Promise<unknown>;
    }

    /** sends ready to BG script on document load */
    static sendReady() {
      const message: message_pass.message = {
        type: "onload",
        payload: null,
      };

      // @ts-ignore
      browserPrefix.runtime.sendMessage(message);

      return false;
    }

    /** Requests TB 7 eval for current position */
    static sendTBEvalRequest(ply: number) {
      const fenString = chessCurrent.actions.getFullFenAtIndex(ply);

      if (!fenString) return false;

      const message: message_pass.message = {
        type: "request_tb_eval",
        payload: {
          fen: fenString[ply - 1]!.split(" ").join("_"),
          currentPly: ply,
        },
      };

      if (!GameState.TB_Response_History[ply]) {
        browserPrefix.runtime
          // @ts-ignore
          .sendMessage(message)
          .then((response: message_pass.message) => {
            const { type, payload } = response;

            if (
              type !== "response_tb_standard" ||
              !payload.response ||
              typeof payload.response === "string"
            ) {
              return;
            }

            GameState.TB_Response_History[payload.ply] = payload.response;
          });
      }

      return true;
    }
  }

  /**
   * todo add description
   */
  export function applyUserSettings<K extends BooleanKeys<UserSettings>>(
    key: K
  ) {
    switch (key) {
      case "replaceClockSvg":
        fixClockSVG();
        break;
      case "allowKeyboardShortcuts":
        toggleAllowKeyboardShortcuts();
        break;
      // todo
      case "addLinksToGameSchedule":
      case "materialCount":
      case "pgnFetch":
      case "displayEngineNames":
        break;
      case "agreementHighlight":
      case "elo":
      case "ptnml":
        break;
      default:
        console.log(key satisfies never);
        break;
    }
  }
}

/** general purpose utility functions */
namespace utils {
  /** removes all whitespaces from the string */
  export function removeWhitespace(str: string) {
    return str.replace(/\s/g, "");
  }

  export function objectKeys<T extends {}>(obj: T) {
    return Object.keys(obj) as Array<keyof T>;
  }

  export function logError(e: any) {
    console.log(e?.message ?? e);
  }
}

// this was added for no reason in particular
class Maybe {
  private value: any;

  constructor(value: any) {
    this.value = value;
  }

  _bind<T extends (...args: any) => any>(fn: T) {
    if (this.value === undefined || this.value === null) {
      return new Maybe(null);
    }

    const result = fn(this.value);

    if (result === undefined || result === null) {
      return new Maybe(null);
    }

    return new Maybe(result);
  }
}
