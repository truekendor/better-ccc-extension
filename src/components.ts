/// <reference types="./types" />
/// <reference path="./types/index.d.ts" />

// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-namespace
namespace components {
  /**  provides methods for creating crosstable elements */
  export class CrossTable {
    static crExtensionSettingsBtn(): HTMLButtonElement {
      const extensionSettingsBtn = document.createElement("button");
      const gearSVG = SVG.Icons.gear;

      extensionSettingsBtn.title = "Extension settings";

      extensionSettingsBtn.classList.add("ccc-extension-settings-btn");
      extensionSettingsBtn.append(gearSVG);

      extensionSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        components.CrossTable.crExtensionSettingsModal();
      });

      return extensionSettingsBtn;
    }

    private static crExtensionSettingsModal(): void {
      const crossTableModal = document.querySelector(
        ".modal-vue-modal-content"
      )!;

      const modalBackdrop = document.createElement("div");
      const modalWrapper = document.createElement("div");

      modalBackdrop.classList.add("ccc-options-backdrop");
      modalWrapper.classList.add("ccc-options-modal");

      modalWrapper.tabIndex = 1;

      modalBackdrop.append(modalWrapper);

      modalBackdrop.addEventListener(
        "click",
        () => {
          crossTableModal.removeChild(modalBackdrop);
        },
        { once: true }
      );

      modalWrapper.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // todo delete
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

    private static crExtensionSettingRow<
      T extends BooleanKeys<user_config.settings>
    >(key: T, description: string): HTMLDivElement {
      const row = document.createElement("div");
      row.classList.add("_row");

      const descriptionElem = document.createElement("p");
      descriptionElem.classList.add("_desc");

      descriptionElem.textContent = description;

      const input = document.createElement("input");
      input.classList.add("ccc-input");
      input.tabIndex = 1000;

      input.type = "checkbox";

      input.checked = UserSettings.custom[key] ?? UserSettings.default[key];

      input.addEventListener("change", () => {
        UserSettings.custom[key] = !UserSettings.custom[key];
        ExtensionHelper.localStorage.setState({
          [key]: UserSettings.custom[key],
        });

        ExtensionHelper.applyUserSettings(key);
      });

      row.append(descriptionElem, input);

      return row;
    }

    static crEngineNames(): void {
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

    static crPTNMLStat(ptnml: PTNML): HTMLDivElement {
      const ptnmlWrapper = this.crStatWrapperElement();
      ptnmlWrapper.classList.add("ccc-ptnml-wrapper");

      const ptnmlElement = document.createElement("div");
      const ptnmlHeader = document.createElement("div");

      ptnmlHeader.id = "ptnml-header";
      ptnmlHeader.textContent = "Ptnml(0-2)";
      ptnmlHeader.title = " LL, LD, WL+DD, WD, WW ";

      this.crPTNMLEntries(ptnmlElement, ptnml);
      ptnmlElement.classList.add("ccc-ptnml");

      ptnmlWrapper.append(ptnmlHeader, ptnmlElement);

      return ptnmlWrapper;
    }

    static crWDLStat(wdlArray: WDL): HTMLDivElement {
      const wdlWrapper = this.crStatWrapperElement();
      wdlWrapper.classList.add("ccc-wdl-wrapper");

      const [wdlElement, eloElement] = this.crEloWDLElement(wdlArray);

      wdlWrapper.append(wdlElement);
      if (eloElement) {
        wdlWrapper.append(eloElement);
      }
      return wdlWrapper;
    }

    static crSettingsSwitch(
      text: string,
      field: BooleanKeys<user_config.settings>
    ): HTMLLabelElement {
      const label = document.createElement("label");
      const switchInput = document.createElement("input");

      label.classList.add("ccc-label");
      label.textContent = `${text}:`;
      label.setAttribute("data-name", field);

      label.htmlFor = `id-${field}`;
      switchInput.id = label.htmlFor;

      switchInput.classList.add("ccc-input");
      switchInput.type = "checkbox";

      switchInput.checked = UserSettings.custom[field] ?? true;

      label.append(switchInput);

      return label;
    }

    /**
     * creates form element that controls
     * amount of game pairs per row
     *
     * selectors: `ccc-form` & `ccc-row-input`
     */
    static crPairsPerRowForm(): HTMLFormElement {
      const formElement = document.createElement("form");
      const rowAmountInput = document.createElement("input");

      formElement.classList.add("ccc-form");
      rowAmountInput.classList.add("ccc-row-input");

      formElement.textContent = `Pairs per row`;

      rowAmountInput.type = "number";
      rowAmountInput.min = "0";
      rowAmountInput.value = `${
        enginesAmount === 2
          ? UserSettings.custom.pairsPerRowDuel
          : UserSettings.custom.pairsPerRow
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
          ExtensionHelper.localStorage.setState({
            pairsPerRowDuel: value || "",
          });
          UserSettings.custom.pairsPerRowDuel = value;
        } else {
          ExtensionHelper.localStorage.setState({
            pairsPerRow: value || "",
          });
          UserSettings.custom.pairsPerRow = value;
        }
      });

      return formElement;
    }

    /**
     *  creates SVG caret that opens the additional stats modal
     */
    static crAdditionalStatButton(
      stats: AdditionalStats,
      index_1: number,
      index_2: number
    ): HTMLDivElement {
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
     * creates all additional stat entries and puts them
     * into container
     */
    private static crAdditionalStatContent(
      stats: AdditionalStats,
      index_1: number,
      index_2: number
    ): HTMLDivElement {
      const mainContainer = document.createElement("div");
      mainContainer.classList.add("ccc-info-panel");
      mainContainer.innerHTML = "";

      const waveContainer = this.crWaveWrapper();

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

      // const p6 = this.crStatRow("Highest score: ", `[+${stats.highestScore}]`);

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

    private static crWaveWrapper(): HTMLDivElement {
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
     * creates row with 100% width for PTNML or Elo stat
     */
    private static crStatRow(info: string, stat: string): HTMLDivElement {
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

    private static crPTNMLEntries(element: HTMLDivElement, ptnml: PTNML): void {
      let ptnmlTextContent = "";
      ptnmlTextContent += `${ptnml[0]}, `;
      ptnmlTextContent += `${ptnml[1]}, `;
      ptnmlTextContent += `${ptnml[2]}, `;
      ptnmlTextContent += `${ptnml[3]}, `;
      ptnmlTextContent += `${ptnml[4]}`;

      element.textContent = ptnmlTextContent;
    }

    /**
     * creates elo and elo-error margin element
     */
    private static crEloAndMarginElement(
      elo: string,
      margin: string
    ): HTMLDivElement {
      const wrapper = document.createElement("div");
      const eloElement = document.createElement("p");
      const marginElement = document.createElement("p");

      eloElement.title = "ELO";

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
    private static crEloWDLElement(
      wdl: WDL
    ): readonly [HTMLDivElement, HTMLDivElement | null] {
      const numberOfGames = wdl.reduce((amount, prev) => amount + prev, 0);

      const wdlElement = document.createElement("div");
      wdlElement.classList.add("ccc-wdl-container");
      wdlElement.title = "WDL";

      const w = document.createElement("p");
      const d = document.createElement("p");
      const l = document.createElement("p");

      w.textContent = `+${wdl[0]}`;
      d.textContent = `=${wdl[1]}`;
      l.textContent = `-${wdl[2]} `;

      // default CCC classes
      w.classList.add("win");
      d.classList.add("draw");
      l.classList.add("loss");

      wdlElement.classList.add("ccc-margin-right");

      const points = wdl[0] + wdl[1] / 2;

      let elo: string | null = null;
      let margin: string | null = null;
      let eloWrapper: HTMLDivElement | null = null;

      if (numberOfGames >= 2) {
        elo = ELO.calculateEloFromPercent((points / numberOfGames) * 100);
        margin = ELO.calculateErrorMargin(wdl[0], wdl[1], wdl[2]);

        margin = `±${margin}`;

        eloWrapper = this.crEloAndMarginElement(elo, margin);
      }

      wdlElement.append(w, d, l);

      return [wdlElement, eloWrapper] as const;
    }

    /**
     * creates containers for `PTNML` / `Elo` elements
     */
    private static crStatWrapperElement(): HTMLDivElement {
      const wrapper = document.createElement("div");
      wrapper.classList.add("ccc-stat-wrapper");

      return wrapper;
    }
  }

  // todo rename
  export class MainWindow {
    /**
     * creates wrapper for captured pieces SVGs
     *
     * selector: `.ccc-captured-pieces-wrapper`
     */
    static crMaterialCountWrapper(): HTMLDivElement {
      const div = document.createElement("div");
      div.classList.add("ccc-captured-pieces-wrapper");
      return div;
    }

    /**
     * fixed button for debug
     */
    static _dev_createFixedButton(): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.classList.add("dev-fixed-button");

      btn.textContent = "click";

      document.body.append(btn);

      return btn;
    }
  }
}
