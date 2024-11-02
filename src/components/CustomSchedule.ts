// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomSchedule {
  private static cssClasses = {
    content: "ccc-custom-schedule-content",
    virtualWrapper: "ccc-custom-schedule_virtual-wrapper",
    //
    button: "ccc-custom-schedule-btn",
    row: "ccc-custom-schedule-row",
  };

  private static virtualWrapperCapacity = 20 as const;
  private static initialScroll = true;

  static crCustomScheduleBtn() {
    const btn = document.createElement("button");

    btn.classList.add(this.cssClasses.button);
    btn.textContent = "Schedule";

    document.body.append(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const existingModal = document.body.querySelector(
        `.${this.cssClasses.content}`
      );

      if (!existingModal) {
        document.body.appendChild(this.crScheduleModal());
        return;
      } else {
        console.time("remove schedule");
        document.body.removeChild(existingModal);
        console.timeEnd("remove schedule");

        return;
      }

      // console.time("toggle visibility");
      // existingModal.classList.toggle("ccc-display-none");
      // console.timeEnd("toggle visibility");
    });
  }

  private static crScheduleModal() {
    this.initialScroll = true;

    const content = document.createElement("div");
    content.classList.add(this.cssClasses.content);

    const currentEvent = _dev_EventState.getCurrentEvent();
    if (!currentEvent || !("schedule" in currentEvent)) {
      return content;
    }

    const { schedule, players } = currentEvent;

    let currentGameNumber = this.binarySearchCurrentGameIndex(schedule);
    if (currentGameNumber === -1) {
      currentGameNumber = this.searchCurrentGameIndex(schedule);
    }

    console.log(currentGameNumber);

    console.time("cr_row");
    // for (let i = 0; i < schedule.length; i++) {
    //   const cur = schedule[i];

    //   const row = this.crRow(i + 1, players[cur.p[0]], players[cur.p[1]], cur);

    //   // const row = this.crSimpleRow(
    //   //   i + 1,
    //   //   currentGameNumber + 1,
    //   //   players[cur.p[0]],
    //   //   players[cur.p[1]]
    //   // );

    //   content.append(row);
    // }
    for (let i = 0; i < schedule.length; i += this.virtualWrapperCapacity) {
      const virtualWrapper = this.crVirtualWrapper(
        schedule,
        players,
        i / this.virtualWrapperCapacity,
        content,
        currentGameNumber
      );

      // const row = this.crSimpleRow(
      //   i + 1,
      //   currentGameNumber + 1,
      //   players[cur.p[0]],
      //   players[cur.p[1]]
      // );

      content.append(virtualWrapper);
    }

    console.timeEnd("cr_row");

    return content;
  }

  private static crRow(
    gameNumber: number,
    p1Name: string | undefined,
    p2Name: string | undefined,
    scheduleEntry: chess_com.schedule_entry
  ) {
    const wrapper = document.createElement("div");
    wrapper.classList.add(this.cssClasses.row);

    const gameNumberEl = document.createElement("div");
    gameNumberEl.textContent = `${gameNumber}`;

    const engineName1 = document.createElement("div");
    engineName1.textContent = p1Name || "";

    const engineName2 = document.createElement("div");
    engineName2.textContent = p2Name || "";

    const engineLogoElem1 = this.createEngineLogo(p1Name || "");
    const engineLogoElem2 = this.createEngineLogo(p2Name || "");

    const isEnded = "id" in scheduleEntry;
    const isGameOngoing = "inProgress" in scheduleEntry;

    const resultEl = document.createElement("div");

    if (isEnded) {
      resultEl.textContent = `${scheduleEntry.res}\n${scheduleEntry.numMoves}`;
    } else if (isGameOngoing) {
      resultEl.textContent = `In Progress`;
    } else {
      resultEl.textContent = "Future";
    }

    wrapper.append(
      gameNumberEl,
      engineLogoElem1,
      engineName1,
      resultEl,
      engineName2,
      engineLogoElem2
    );

    return wrapper;
  }

  private static crSimpleRow(
    gameNumber: number,
    currentGameNumber: number,
    p1Name: string | undefined,
    p2Name: string | undefined
  ) {
    const wrapper = document.createElement("div");

    const gameNumberEl = document.createElement("div");
    gameNumberEl.textContent = `${gameNumber}`;

    const engineName1 = document.createElement("div");
    engineName1.textContent = p1Name || "";

    const engineName2 = document.createElement("div");
    engineName2.textContent = p2Name || "";

    const engineLogoElem1 = document.createElement("img");
    this.getLogoLink(p1Name);
    // engineLogoElem1.src = this.getLogoLink(p1Name);
    engineLogoElem1.alt = `${p1Name} engine`;

    const engineLogoElem2 = document.createElement("img");
    this.getLogoLink(p2Name);
    // engineLogoElem2.src = this.getLogoLink(p2Name);
    engineLogoElem2.alt = `${p2Name} engine`;

    const resultEl = document.createElement("div");

    wrapper.append(
      gameNumberEl,
      engineLogoElem1,
      engineName1,
      resultEl,
      engineName2,
      engineLogoElem2
    );

    return wrapper;
  }

  private static createEngineLogo(engineName: string | undefined) {
    const engineLogo = document.createElement("img");
    engineLogo.src = this.getLogoLink(engineName);
    engineLogo.alt = `${engineName} engine`;

    return engineLogo;
  }

  private static getLogoLink(engineName: string | undefined) {
    return engineName === undefined
      ? ""
      : `https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/sm_${engineName.toLowerCase()}.png`;
  }

  private static crVirtualWrapper(
    schedule: chess_com.schedule_entry[],
    players: chess_com.full_event_response["players"],
    wrapperIndex: number,
    parentElem: HTMLDivElement,
    currentGameNumber: number
  ) {
    const wrapper = document.createElement("div");
    const _rowHeight = 34;
    wrapper.classList.add(this.cssClasses.virtualWrapper);

    const rowAmount = Math.min(
      schedule.length - wrapperIndex * this.virtualWrapperCapacity,
      this.virtualWrapperCapacity
    );

    const containsCurrentGame =
      wrapperIndex * this.virtualWrapperCapacity < currentGameNumber &&
      (wrapperIndex + 1) * this.virtualWrapperCapacity > currentGameNumber;

    wrapper.style.height = `${_rowHeight * rowAmount}px`;
    wrapper.style.outline = "1px solid red";
    // wrapper.style.display = "contents";

    const intObserver = new IntersectionObserver(
      (entires) => {
        entires.forEach((entry) => {
          if (entry.isIntersecting || containsCurrentGame) {
            for (let i = 0; i < rowAmount; i++) {
              const scheduleIndex =
                wrapperIndex * this.virtualWrapperCapacity + i;

              const row = this.crRow(
                scheduleIndex + 1,
                players[schedule[scheduleIndex].p[0]],
                players[schedule[scheduleIndex].p[1]],
                schedule[scheduleIndex]
              );

              wrapper.append(row);
            }
          } else {
            Utils.removeChildNodes(wrapper);
          }
        });
      },
      {
        root: parentElem,
        rootMargin: "300px",
        threshold: 0,
      }
    );

    intObserver.observe(wrapper);

    if (containsCurrentGame && this.initialScroll) {
      this._dev(wrapper, currentGameNumber);
    }

    return wrapper;
  }

  private static async _dev(
    wrapper: HTMLDivElement,
    currentGameNumber: number
  ) {
    await Utils.doubleAnimationFramePromise();
    wrapper.scrollIntoView();

    await Utils.doubleAnimationFramePromise();

    const currentGameInnerIndex =
      currentGameNumber % this.virtualWrapperCapacity;

    // todo rename
    const hm = wrapper.children[currentGameInnerIndex];

    hm.scrollIntoView();

    await Utils.doubleAnimationFramePromise();

    hm.scrollBy({
      top: 200,
    });

    await Utils.doubleAnimationFramePromise();

    hm.scrollBy({
      top: 200,
    });
  }

  /**
   * Unfortunately, this is not robust
   * If games are replayed, this logic is completely broken
   * So fallback is required @see {searchCurrentGameIndex}
   *
   * @returns {number} `index` of current game or `-1` in not found
   */
  private static binarySearchCurrentGameIndex(arr: chess_com.schedule_entry[]) {
    let start = 0;
    let end = arr.length - 1;

    while (start <= end) {
      const mid = Math.floor((start + end) / 2);

      if ("inProgress" in arr[mid]) {
        return mid;
      }

      const tooLarge = "startTime" in arr[mid];

      if (tooLarge) {
        end = mid - 1;
      } else {
        start = mid + 1;
      }
    }
    return -1;
  }

  private static searchCurrentGameIndex(arr: chess_com.schedule_entry[]) {
    let index = -1;

    for (let i = 0; i < arr.length; i++) {
      if ("inProgress" in arr[i]) {
        index = i;
        break;
      }
    }

    return index;
  }
}
