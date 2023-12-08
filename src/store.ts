class _DOM_Store {
  /**
   * main container
   *
   * contains all DOM elements except
   * the Twitch chat and the left navigation bar
   */
  static mainContainer: HTMLDivElement =
    // for some reason class becomes an ID if opened from mobile
    document.querySelector(".cpu-champs-page-ccc")! ??
    document.querySelector("#cpu-champs-page-ccc");

  // * =========================
  // * bottom right part of the screen:
  // ? <bottomPanel>
  // ?   <eventList button>
  // ?   <tabButtonsContainer>
  // ?      <tabButtons - vote | standings | schedule etc... >
  // ?   </tabButtonsContainer>
  // ?   <...>
  // ?     <...>
  // ?   </...>
  // ? </bottomPanel>

  /**
   * div container on bottom-right part of the screen
   */
  static bottomPanel: HTMLDivElement = document.getElementById(
    "bottomtable-bottomtable"
  )! as HTMLDivElement;

  static tabButtonsContainer = this.bottomPanel.querySelector(
    ".selection-panel-container"
  )!;

  /**
   * node list of `vote` / `standings` / `schedule` / `match` / `info` buttons
   */
  static tabButtons: NodeListOf<HTMLSpanElement> =
    this.bottomPanel.querySelectorAll(".selection-panel-item")!;

  /**
   *  button with text "standings"
   */
  static standingsBtn = this.tabButtons[1];

  /**
   * button with text "schedule"
   */
  static scheduleBtn = this.tabButtons[2];

  // not all tab buttons, actually
  static allTabButtons = {
    voteBtn: this.tabButtons[0],
    standings: this.tabButtons[1],
    schedule: this.tabButtons[2],
    match: this.tabButtons[3],
    info: this.tabButtons[4],
  };

  /**
   * direct parent of a `movesTable`
   */
  static movesTableContainer: HTMLDivElement = document.querySelector(
    ".movetable-tablewrapper"
  )!;

  /**
   * main moves table
   */
  static movesTable: HTMLTableElement =
    this.movesTableContainer.querySelector("table")!;
}

class _State {
  static CHESS_STARTING_POSITION =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  static userSettingsDefault: UserSettings = {
    ptnml: true,
    elo: true,
    pairsPerRow: 5,
    pairsPerRowDuel: 10,
    allowKeyboardShortcuts: true,
    agreementHighlight: true,
    pgnFetch: true,
    addLinksToGameSchedule: true,
    replaceClockSvg: true,
    displayEngineNames: true,
    materialCount: true,
  };

  static eventHrefList: string[] = [];

  /** event data from the page content */
  static pageData: PageData = {
    currentGame: null,
    totalGames: null,
    active: false,
  };

  /** event data from the current active tab */
  static tabData: TabData = {
    event: null,
    game: null,
  };

  // todo
  static _data = {
    pageCurrentGame: null,
    tabCurrentGame: null,
    //
    totalGames: null,
    eventId: null,
    eventActive: false,
  };

  // todo delete?
  static get gameNumber() {
    return (
      this.tabData.game ?? this.pageData.currentGame ?? this.pageData.totalGames
    );
  }

  static get currentEventId() {
    return _State.tabData.event || _State.eventHrefList[0];
  }
}

// todo rewrite
class Transpositions {
  static sequence = -1;
  static TTList: TTEntry[] = [];

  static reset() {
    this.sequence = -1;
    this.TTList.length = 0;
  }
}

/**
 * todo delete description
 * dev version with object pool
 * to avoid GC
 */
class TT_dev {
  private TTList: readonly TTEntry[] = [];
  private sequence = -1;

  private lastIndex = 0;

  private defaultObject: TTEntry = {
    currentPly: -1,
    reversePly: -1,
    fen: "",
  };

  constructor(size: number = 1000) {
    this.populateObjectPool(size);
  }

  reset() {
    this.TTList.forEach((_, index) => {
      this.TTList[index].currentPly = this.defaultObject.currentPly;
      this.TTList[index].reversePly = this.defaultObject.reversePly;
      this.TTList[index].fen = this.defaultObject.fen;
    });

    this.lastIndex = 0;
    this.sequence = -1;
  }

  get(index: number) {
    return this.TTList[index];
  }

  add(
    currentPly: TTEntry["currentPly"],
    reversePly: TTEntry["reversePly"],
    fen: TTEntry["fen"]
  ) {
    const currentObj = this.TTList[this.lastIndex];

    currentObj.currentPly = currentPly;
    currentObj.reversePly = reversePly;
    currentObj.fen = fen;

    this.lastIndex += 1;
  }

  private populateObjectPool(size: number) {
    for (let i = 0; i < size; i++) {
      const obj: TTEntry = {
        currentPly: this.defaultObject.currentPly,
        reversePly: this.defaultObject.reversePly,
        fen: this.defaultObject.fen,
      };

      // @ts-ignore
      this.TTList.push(obj);
    }

    Object.freeze(this.TTList);
  }
}

const qqq = new TT_dev();
