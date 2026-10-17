# Chrome/Firefox/Edge and android extension for [CCC](https://www.chess.com/computer-chess-championship#)

## Installation
- Download/clone this repo `(only needed for chrome)`
- ![Download helper](https://github.com/truekendor/better-ccc-extension/blob/main/img/download.webp)

## Firefox for *desktop*/*android*
- Make sure you have updated your browser
- Open [this link](https://addons.mozilla.org/en-US/firefox/addon/better-ccc/) in your browser and install the add-on


## Firefox: build from source (desktop, Firefox 140+ / ESR)
- `npm install && npm run package:firefox` (compiles the TypeScript and writes `builds/better-ccc-<version>-firefox.xpi`; `node scripts/package-firefox.mjs --out <file.xpi>` to choose the path)
- **Temporary install (any Firefox):** open `about:debugging#/runtime/this-firefox` → `Load Temporary Add-on...` → select `src/manifest.json` (after `npm run build`) or the built `.xpi`. It is removed when Firefox restarts.
- **Permanent install of the unsigned `.xpi` (ESR, Developer Edition, Nightly only):** in `about:config` set `xpinstall.signatures.required` to `false`, then `about:addons` → gear icon → `Install Add-on From File...` → select the `.xpi`. Release Firefox always requires an AMO-signed `.xpi`.
- Firefox lets you control which sites a Manifest V3 add-on can access. If the toolbar button shows a `!` badge (or the add-on does nothing on CCC), click the button and allow access to `chess.com`, or enable it in `about:addons` → better-ccc → `Permissions`.
- Optional: `npx web-ext lint --source-dir src` runs Mozilla's add-on linter (the same checks as AMO). It isn't needed for the build.

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
 
## Hotkeys 

You can close `cross table`/`engine info` modals by pressing `Esc`

`Ctrl` + `Shift` + `U` to disable/enable shortcuts

Press `C` to open `Cross table`

Press `S` to open `Schedule`


# Acknowledgements

The idea and design are inspired by [David's](https://github.com/dav1312) custom extension

Formulas for calculating elo and error margins were taken from [here](https://3dkingdoms.com/chess/elo.htm)
