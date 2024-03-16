"use strict";
/** general purpose utility functions */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Utils {
    /** removes all whitespaces from the string */
    static removeWhitespace(str) {
        return str.replace(/\s/g, "");
    }
    static objectKeys(obj) {
        return Object.keys(obj);
    }
    static logError(e) {
        console.log(e?.message ?? e);
    }
    static log(message, color) {
        const optionsString = `color: ${this.colorMap[color]}; font-weight: bold;`;
        console.log(`%c${message}`, optionsString);
    }
    /** removes passed node from the DOM */
    static removeNode(nodeToRemove) {
        nodeToRemove.parentNode?.removeChild(nodeToRemove);
    }
    /** removes all children from the passed node */
    static removeChildNodes(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }
    static doubleAnimationFramePromise() {
        return new Promise((res) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => res());
            });
        });
    }
    static sleepAsync(timeMs) {
        return new Promise((res) => {
            setTimeout(res, timeMs);
        });
    }
    static async retry({ cb, retryCount, retryWaitTime, }) {
        if (retryCount <= 0) {
            throw new Error("retry: retryCount must be >= 1");
        }
        if (retryWaitTime < 0) {
            throw new Error("retry: retryWaitTime must be >= 0");
        }
        let result = false;
        while (retryCount > 0) {
            retryCount -= 1;
            result = await cb();
            if (result) {
                break;
            }
            await Utils.sleepAsync(retryWaitTime);
        }
        return result;
    }
}
Utils.colorMap = {
    blue: "lightblue",
    red: "tomato",
    green: "lightgreen",
    orange: "orange",
    //
    pBlack: "black",
    pWhite: "white",
    pRed: "red",
    pGreen: "green",
    pBlue: "blue",
};
// this was added for no reason in particular
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Maybe {
    constructor(value) {
        this.value = value;
    }
    _bind(fn) {
        if (this.value === undefined || this.value === null) {
            return new Maybe(null);
        }
        const result = fn(this.value);
        if (result === undefined || result === null) {
            return new Maybe(null);
        }
        return new Maybe(result);
    }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function debounce({ cb, wait }) {
    let timerId = -1;
    return function debouncedCb(...args) {
        if (timerId) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            cb(...args);
        }, wait);
    };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class DebouncePromise {
    constructor({ cb, wait }) {
        this.timerId = -1;
        this.cb = cb;
        this.wait = wait;
        this.promise = new Promise((res) => {
            this.resolve = res;
        });
    }
    sub() {
        return this.promise;
    }
    do(...args) {
        if (this.timerId) {
            clearTimeout(this.timerId);
        }
        this.timerId = setTimeout(() => {
            const result = this.cb(...args);
            this.resolve(result);
        }, this.wait);
    }
}
