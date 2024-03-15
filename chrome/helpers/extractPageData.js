"use strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ExtractPageData {
    /**
     *  somewhat reliable way to get current game number from webpage
     */
    static async getCurrentGameNumber() {
        // to make TS happy
        const tempNumber = _State.gameNumberTab;
        if (tempNumber) {
            return Promise.resolve(tempNumber);
        }
        const scheduleContainer = _DOM_Store.bottomPanel.querySelector(".schedule-container");
        if (scheduleContainer) {
            const gameLinks = scheduleContainer.querySelectorAll(".schedule-game-link");
            let gameNumber = 0;
            gameLinks.forEach((link, index) => {
                if (link.classList.contains("schedule-in-progress")) {
                    gameNumber = index + 1;
                }
            });
            return Promise.resolve(gameNumber || gameLinks.length);
        }
        const standingsContainer = document.getElementById("standings-standings");
        if (standingsContainer) {
            const gameNumber = this.getGameNumberFromStandings();
            return Promise.resolve(gameNumber);
        }
        const currentTabIndex = this.getPressedButtonIndex();
        // await microtask
        await new Promise((res) => {
            res(_DOM_Store.standingsBtn.click());
        });
        const gameNumber = this.getGameNumberFromStandings();
        _DOM_Store.tabButtons[currentTabIndex].click();
        return gameNumber;
    }
    static getMoveNumber() {
        const cellList = _DOM_Store.movesTableContainer.querySelectorAll("td");
        let index = -1;
        cellList.forEach((el, i) => {
            if (!el.classList.contains("movetable-highlighted"))
                return;
            index = i;
        });
        return index;
    }
    static getPGNFromMoveTable() {
        const pgnArray = [];
        const cellsWithMoves = this.getMovesElements();
        cellsWithMoves.forEach((cell) => {
            const text = cell.textContent;
            if (!text)
                return;
            pgnArray.push(Utils.removeWhitespace(text));
        });
        const filteredPgnArray = pgnArray.filter((el) => el !== "" && el !== " ");
        return filteredPgnArray;
    }
    static getMovesElements() {
        return _DOM_Store.movesTable.querySelectorAll("td");
    }
    static getGameNumberFromSchedule(scheduleContainer) {
        const gameLinks = scheduleContainer.querySelectorAll(".schedule-game-link");
        let gameNumber = 0;
        gameLinks.forEach((link, index) => {
            if (link.classList.contains("schedule-in-progress")) {
                gameNumber = index + 1;
            }
        });
        return gameNumber;
    }
    static getGameResultDiv() {
        return _DOM_Store.movesTableContainer.querySelector(".movetable-gameResult");
    }
    static async getEventId() {
        const eventNameWrapper = _DOM_Store.bottomPanel.querySelector(".bottomtable-event-name-wrapper");
        eventNameWrapper.click();
        // ? hacky way of chaining microtasks
        await null;
        const eventsWrapper = _DOM_Store.bottomPanel.querySelector(".bottomtable-resultspopup");
        const linkElement = eventsWrapper.querySelector("a");
        if (linkElement) {
            const eventId = linkElement.href.split("#")[1];
            if (eventId) {
                _State.eventIdWebpage = eventId.replace("event=", "");
                createScheduleLinks();
            }
        }
        await null;
        eventNameWrapper.click();
    }
    static get isMobile() {
        return !!this.isMobileDevice;
    }
    //  * --------------------------
    //  *
    static getGameNumberFromStandings() {
        const standingsContainer = document.getElementById("standings-standings");
        const standingsItem = standingsContainer.querySelectorAll(".engineitem-list-item");
        let counter = 0;
        standingsItem.forEach((item) => {
            const scoreElement = item.querySelector(".engineitem-score");
            const text = scoreElement.textContent.trim();
            const score = text.split("/")[1];
            counter += parseInt(score);
        });
        counter /= 2;
        counter += 1;
        counter = Math.min(counter, _State.gamesInTotal || counter);
        return counter;
    }
    /** returns index of a current pressed button (vote/standings/schedule...) */
    static getPressedButtonIndex() {
        const buttons = _DOM_Store.tabButtonsContainer.querySelectorAll(".selection-panel-item");
        let selectedBtnIndex = -1;
        buttons.forEach((btn, index) => {
            if (index > 4)
                return;
            if (btn.classList.contains("selection-panel-selected")) {
                selectedBtnIndex = index;
            }
        });
        return selectedBtnIndex;
    }
}
ExtractPageData.isMobileDevice = document.querySelector("#cpu-champs-page-ccc");
