# Chrome/Firefox/Edge and android extension for [CCC](https://www.chess.com/computer-chess-championship#)

## Installation
- Download/clone this repo `(only needed for chrome)`
- ![Download helper](https://github.com/truekendor/better-ccc-extension/blob/main/img/download.webp)

## Firefox for *desktop*/*android*
- Make sure you have updated your browser
- Open [this link](https://addons.mozilla.org/en-US/firefox/addon/better-ccc/) in your browser and install the add-on


## Chrome / Edge / Other Chromium based browsers
- Unzip one of the archives from the chrome folder
- Open `chrome://extensions/` page
- Enable developer mode
- Click `Load unpacked` button
- Select the unziped `chrome` folder
- `!! Don't forget to uninstall the previous version of the extension`

## Other option for Firefox
- Open `about:addons` page
- Click on this button
- ![](https://github.com/truekendor/better-ccc-extension/blob/main/img/firefox_where.webp)
- Click `Install add-on From File...`
- Select `.xpi` file from `firefox` folder
- Grant permissions if needed
- ![Grant permissions](https://github.com/truekendor/better-ccc-extension/blob/main/img/grant%20permissions.webp)


## Features !TODO
  - Better cross table ![Extension preview](https://github.com/truekendor/better-ccc-extension/blob/main/img/preview.webp)
  - Reverse deviation highlight; Underline == same position
  - ![deviation](https://github.com/truekendor/better-ccc-extension/blob/main/img/preview-highlight.jpg)
  - Click on schedule button to scroll to the current game ![schedule button click](https://github.com/truekendor/better-ccc-extension/blob/main/img/schedule-click.jpg)
  - GUI bugfixes
  - Extra hotkeys with a `?` help overlay listing every shortcut (can be turned off in the extension settings: `Extra hotkeys`)
  - Live tab title: the browser tab shows the last move (`34. Nf3`, `34… Rxe5`) or the result (`1-0`) of the displayed game, so you can follow it from another tab (setting: `Last move in tab title`)
 
## Hotkeys 

You can close `cross table`/`engine info` modals by pressing `Esc`

`Ctrl` + `Shift` + `U` to disable/enable shortcuts

Press `C` to open `Cross table`

Press `S` to open `Schedule`

Extra hotkeys (toggle `Extra hotkeys` in the extension settings):

Press `?` to show/hide the list of all hotkeys

Press `1`-`5` to switch the bottom panel tab (`Vote` / `Standings` / `Schedule` / `Match` / `Info`)

Press `L` to jump to the live game (opens the schedule if needed)

Press `E` to open/close the event list

Hotkeys are ignored while typing in an input field


# Acknowledgements

The idea and design are inspired by [David's](https://github.com/dav1312) custom extension

Formulas for calculating elo and error margins were taken from [here](https://3dkingdoms.com/chess/elo.htm)
