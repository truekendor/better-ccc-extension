// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class _State {
  static eventIdTab: string | null = null;
  static eventIdWebpage: string | null = null;

  static gameNumberTab: number | null = null;

  static isEventActive: boolean | null = null;
  static gamesInTotal: number | null = null;

  static get eventId(): string | null {
    return this.eventIdTab || this.eventIdWebpage;
  }
}

/**
 * @todo add description
 * user settings state
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class UserSettings {
  static defaultSettings: user_config.settings = {
    // crosstable stat rules
    ptnml: true,
    elo: true,
    // crosstable styles
    displayEngineNames: true,
    drawnPairNeutralColorWL: true,
    pairsPerRow: 5,
    pairsPerRowDuel: 10,

    // deviation highlight rules
    allowNetworkGameRequest: true,
    highlightReverseDeviation: true,

    // other rules
    addLinksToGameSchedule: true,
    allowKeyboardShortcuts: true,
    replaceClockSvg: true,
    materialCount: true,
    clearQueryStringOnCurrentGame: true,
  } as const;

  static customSettings: user_config.settings = {
    // crosstable stat rules
    ptnml: true,
    elo: true,
    // crosstable styles
    displayEngineNames: true,
    drawnPairNeutralColorWL: true,
    pairsPerRow: 5,
    pairsPerRowDuel: 10,

    // deviation highlight rules
    allowNetworkGameRequest: true,
    highlightReverseDeviation: true,

    // other rules
    addLinksToGameSchedule: true,
    allowKeyboardShortcuts: true,
    replaceClockSvg: true,
    materialCount: true,
    clearQueryStringOnCurrentGame: true,
  };
}
