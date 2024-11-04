// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomSchedule {
  private static cssClasses = {
    content: "ccc-custom-schedule-content",
    virtualWrapper: "ccc-custom-schedule_virtual-wrapper",
    //
    button: "ccc-custom-schedule-btn",
    row: "ccc-custom-schedule-row",
    _dev_preventObserverDeletion: "__________DEV",
    _dev_containsCurrentGame: "_____DEV_____",
  };

  private static virtualWrapperList: HTMLDivElement[] = [];
  private static virtualWrapperCapacity = 30 as const;

  // todo delete?
  private static virtualWrapperSettings = {
    capacity: 6,
    rowHeight: 34,
    list: [],
  };

  private static eventStats: Pick<
    chess_com.full_event_response,
    "schedule" | "players"
  > & {
    currentGameNumber: number;
  } = {
    currentGameNumber: -1,
    players: [],
    schedule: [],
  };

  // * ======================
  // * methods
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
    const contentWrapper = document.createElement("div");
    contentWrapper.classList.add(this.cssClasses.content);

    const currentEvent = _dev_EventState.getCurrentEvent();
    if (!currentEvent || !("schedule" in currentEvent)) {
      return contentWrapper;
    }

    const { schedule, players } = currentEvent;

    let currentGameNumber = this.binarySearchCurrentGameIndex(schedule);

    const event = _dev_EventState.getCurrentEvent();
    const eventEnded = event && "id" in event;

    // todo check if the "end" flag is present in case games are played
    // todo after the last game of the event is played
    const isGamesReplayed = currentGameNumber === -1 && !eventEnded;

    if (isGamesReplayed) {
      currentGameNumber = this.searchCurrentGameIndex(schedule);
    }

    this.eventStats.schedule = schedule;
    this.eventStats.players = players;
    this.eventStats.currentGameNumber = currentGameNumber;

    console.log(currentGameNumber);

    console.time("cr_row");

    this.virtualWrapperList.length = 0;

    for (let i = 0; i < schedule.length; i += this.virtualWrapperCapacity) {
      const virtualWrapper = this.crVirtualWrapper(
        schedule,
        players,
        i / this.virtualWrapperCapacity,
        contentWrapper,
        currentGameNumber
      );

      contentWrapper.append(virtualWrapper);
      this.virtualWrapperList.push(virtualWrapper);
    }

    if (currentGameNumber === -1) {
      this.addRowsToVirtualWrapper(this.virtualWrapperList[0], 0);
      this.filleNeighborVirtualElements(1, 1, 1);
      this.filleNeighborVirtualElements(0, 1, 1);
      this.filleNeighborVirtualElements(
        this.virtualWrapperList.length - 1,
        1,
        1
      );
    }

    this.scrollToCurrentGame(currentGameNumber);

    console.timeEnd("cr_row");

    return contentWrapper;
  }

  private static crVirtualWrapper(
    schedule: chess_com.schedule_entry[],
    players: chess_com.full_event_response["players"],
    wrapperIndex: number,
    parentElem: HTMLDivElement,
    currentGameNumber: number
  ) {
    const virtualWrapper = document.createElement("div");
    const rowHeight = 34;
    virtualWrapper.classList.add(this.cssClasses.virtualWrapper);

    const rowAmount = Math.min(
      schedule.length - wrapperIndex * this.virtualWrapperCapacity,
      this.virtualWrapperCapacity
    );

    const containsCurrentGame = this.isVirtualWrapperContainsCurrentGame(
      currentGameNumber,
      wrapperIndex
    );

    virtualWrapper.style.height = `${rowHeight * rowAmount}px`;

    if (containsCurrentGame) {
      this.addRowsToVirtualWrapper(virtualWrapper, wrapperIndex);
    }

    // todo move outside
    const intObserver = new IntersectionObserver(
      (entires) => {
        const entry = entires[0];

        if (!entry.isIntersecting && !containsCurrentGame) {
          const containsInitialScrollClasses =
            virtualWrapper.classList.contains(
              this.cssClasses._dev_preventObserverDeletion
            );

          if (!containsCurrentGame && !containsInitialScrollClasses) {
            Utils.removeChildNodes(virtualWrapper);
          }

          if (containsInitialScrollClasses) {
            virtualWrapper.classList.remove(
              this.cssClasses._dev_preventObserverDeletion
            );
          }

          return;
        }

        if (containsCurrentGame) {
          virtualWrapper.classList.add(
            this.cssClasses._dev_containsCurrentGame
          );
        }

        this.addRowsToVirtualWrapper(virtualWrapper, wrapperIndex);
      },
      {
        root: parentElem,
        rootMargin: "300px",
        threshold: 0,
      }
    );

    intObserver.observe(virtualWrapper);

    return virtualWrapper;
  }

  private static crRow(
    gameNumber: number,
    p1Name: string | undefined,
    p2Name: string | undefined,
    scheduleEntry: chess_com.schedule_entry
  ) {
    // todo add <a> tag

    const wrapper = document.createElement("div");
    wrapper.classList.add(this.cssClasses.row);

    const gameNumberEl = document.createElement("div");
    gameNumberEl.textContent = `${gameNumber}`;

    const engineName1 = document.createElement("div");
    engineName1.textContent = `${p1Name}`;

    const engineName2 = document.createElement("div");
    engineName2.textContent = `${p2Name}`;

    const engineLogoElem1 = this.createEngineLogo(p1Name || "");
    const engineLogoElem2 = this.createEngineLogo(p2Name || "");

    const isEnded = "id" in scheduleEntry;
    const isGameOngoing = "inProgress" in scheduleEntry;

    const resultEl = document.createElement("div");

    if (isEnded) {
      resultEl.textContent = `${scheduleEntry.res}\n${scheduleEntry.numMoves}`;

      if (scheduleEntry.res === "1-0") {
        engineName1.classList.add("win");
        engineName2.classList.add("loss");
      } else if (scheduleEntry.res === "0-1") {
        engineName1.classList.add("loss");
        engineName2.classList.add("win");
      } else {
        engineName1.classList.add("draw");
        engineName2.classList.add("draw");
      }
    } else if (isGameOngoing) {
      resultEl.textContent = `In Progress`;
    } else {
      // todo change this
      const now = Date.now();
      const diff = scheduleEntry.startTime - now;

      const minutes = Math.round(diff / 60_000);
      let estimatedTime = "";

      if (minutes < 60) {
        estimatedTime = `In ${minutes} minutes`;
      } else {
        estimatedTime = `In ${Math.floor(minutes / 60)} hours`;
      }

      resultEl.textContent = estimatedTime;
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

  private static createEngineLogo(engineName: string | undefined) {
    const engineLogo = document.createElement("img");

    engineLogo.src = this.getLogoLink(engineName);
    engineLogo.alt = `${engineName} engine`;

    return engineLogo;
  }

  private static getLogoLink(engineName: string | undefined) {
    return engineName === undefined || engineName === ""
      ? ""
      : `https://images.chesscomfiles.com/chess-themes/computer_chess_championship/avatars/sm_${engineName.toLowerCase()}.png`;
  }

  private static addRowsToVirtualWrapper(
    virtualWrapper: HTMLDivElement,
    wrapperIndex: number
  ) {
    if (virtualWrapper.children.length > 0) {
      return;
    }

    const { players, schedule } = this.eventStats;

    const rowAmount = Math.min(
      schedule.length - wrapperIndex * this.virtualWrapperCapacity,
      this.virtualWrapperCapacity
    );

    for (let i = 0; i < rowAmount; i++) {
      const scheduleIndex = wrapperIndex * this.virtualWrapperCapacity + i;

      const row = this.crRow(
        scheduleIndex + 1,
        players[schedule[scheduleIndex].p[0]],
        players[schedule[scheduleIndex].p[1]],
        schedule[scheduleIndex]
      );

      virtualWrapper.append(row);
    }
  }

  private static async scrollToCurrentGame(currentGameNumber: number) {
    for (let i = 0; i < this.virtualWrapperList.length; i++) {
      const containsCurrentGame = this.isVirtualWrapperContainsCurrentGame(
        currentGameNumber,
        i
      );
      const wrapper = this.virtualWrapperList[i];

      if (!containsCurrentGame) {
        continue;
      }

      this.filleNeighborVirtualElements(i, 1, 1);

      wrapper.scrollIntoView();

      await Utils.doubleAnimationFramePromise();
      await null;

      const currentGameVirtualIndex =
        currentGameNumber % this.virtualWrapperCapacity;

      const currentRowElem = wrapper.children[currentGameVirtualIndex];

      currentRowElem.scrollIntoView();

      break;
    }
  }

  /**
   * Fills virtual wrappers that are neighbors to the
   * wrapper that contains current game
   *
   * This is needed to avoid IntersectionObserver bug
   */
  private static filleNeighborVirtualElements(
    wrapperIndex: number,
    ahead: number,
    behind: number
  ) {
    for (let i = 0; i <= ahead + behind; i++) {
      const sum = i - behind;

      if (sum === 0) {
        continue;
      }

      const neighborElement = this.virtualWrapperList[wrapperIndex + sum];

      if (neighborElement) {
        this.addRowsToVirtualWrapper(neighborElement, wrapperIndex + sum);
        neighborElement.classList.add(
          this.cssClasses._dev_preventObserverDeletion
        );
      }
    }
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

  private static isVirtualWrapperContainsCurrentGame(
    currentGameNumber: number,
    wrapperIndex: number
  ) {
    const containsCurrentGame =
      wrapperIndex * this.virtualWrapperCapacity < currentGameNumber &&
      (wrapperIndex + 1) * this.virtualWrapperCapacity > currentGameNumber;

    return containsCurrentGame;
  }
}
