type ButtonNameTypes =
  | "ptnmlBtn"
  | "eloBtn"
  | "addLinksToScheduleBtn"
  | "keyboardShortcutsBtn"
  | "drawBgOnEmptyBtn";

type OptionToButtonNames = Partial<
  Record<BooleanKeys<UserOptions>, ButtonNameTypes>
>;

type ButtonsStore = { [K in ButtonNameTypes]: HTMLButtonElement };
