/// <reference types="./" />
/// <reference path="./popup.d.ts" />
const keyboardShortcutsBtn: HTMLButtonElement | null =
  document.querySelector(".keyboard-btn");
const ptnmlBtn: HTMLButtonElement | null = document.querySelector(".ptnml");
const eloBtn: HTMLButtonElement | null = document.querySelector(".elo");
const drawBgOnEmptyBtn: HTMLButtonElement | null =
  document.querySelector(".cross-bg");
const addLinksToScheduleBtn: HTMLButtonElement | null =
  document.querySelector(".add-links");

const allToggleBtns: NodeListOf<HTMLButtonElement> =
  document.querySelectorAll("[data-btn-toggle]");

const optionNamesToButtonNames: OptionToButtonNames = {
  ptnml: "ptnmlBtn",
  elo: "eloBtn",
  addLinksToGameSchedule: "addLinksToScheduleBtn",
  allowKeyboardShortcuts: "keyboardShortcutsBtn",
  drawBgOnEmptyCells: "drawBgOnEmptyBtn",
} as const;

const buttonsStore: Partial<ButtonsStore> = {};

allToggleBtns.forEach((btn) => {
  const dataName = btn.getAttribute("data-btn-name") as ButtonNameTypes;
  buttonsStore[dataName] = btn;

  btn.addEventListener("pointerdown", optionToggleClickHandler);
});

// @ts-ignore
const browserPrefix = chrome.storage ? chrome : browser;

const userSettingsState: UserOptions = {
  agreementHighlight: true,
  allowKeyboardShortcuts: true,
  drawBgOnEmptyCells: true,
  elo: true,
  pairPerRow: 5,
  pgnFetch: true,
  ptnml: true,
  addLinksToGameSchedule: false,
};

(function loadUserSettings() {
  const storeKeys: BooleanKeys<UserOptions>[] = [
    "elo",
    "ptnml",
    "drawBgOnEmptyCells",
    "allowKeyboardShortcuts",
    "addLinksToGameSchedule",
  ];
  Promise.all(
    storeKeys.map((key) => browserPrefix.storage.local.get(key))
  ).then((options: BooleanUserOptions[]) => {
    options.forEach(applyStoredOptions);
  });
})();

function optionToggleClickHandler(this: HTMLButtonElement) {
  const dataAttr = this.getAttribute(
    "data-toggle-option"
  ) as BooleanKeys<UserOptions> | null;

  if (!dataAttr) return;

  browserPrefix.storage.local
    .set({
      [dataAttr]: !userSettingsState[dataAttr],
    })
    .then(() => {
      userSettingsState[dataAttr] = !userSettingsState[dataAttr];
      this.classList.toggle("active");
      sendOptionToToggle(dataAttr);
    });
}

function sendOptionToToggle(option: BooleanKeys<UserOptions>) {
  browserPrefix.tabs.query(
    { currentWindow: true, active: true },
    function (tabs) {
      const activeTab = tabs[0];
      if (!activeTab.id) return;

      const message: RuntimeMessage = {
        type: "toggle_option",
        payload: {
          optionToToggle: option,
        },
      };

      browserPrefix.tabs.sendMessage<RuntimeMessage>(activeTab.id, message);
    }
  );
}

function applyStoredOptions(option: BooleanUserOptions): void {
  let btnNode: HTMLButtonElement | null | undefined = null;

  const btnKey = Object.keys(option)[0] as keyof BooleanUserOptions;
  const btnName = optionNamesToButtonNames[btnKey] as ButtonNameTypes;
  btnNode = buttonsStore[btnName];

  if (!btnNode) return;

  const key = Object.keys(option)[0] as keyof BooleanUserOptions;
  if (option[key]) {
    btnNode.classList.add("active");
  }

  userSettingsState[key] = option[key] ?? userSettingsState[key];
}

function isNullOrUndefined(val: any): boolean {
  return val === null || val === undefined;
}
