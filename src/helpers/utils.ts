/** general purpose utility functions */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Utils {
  private static colorMap = {
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
  } as const;

  /** removes all whitespaces from the string */
  public static removeWhitespace(str: string): string {
    return str.replace(/\s/g, "");
  }

  public static objectKeys<T extends object>(obj: T): Array<keyof T> {
    return Object.keys(obj) as Array<keyof T>;
  }

  public static logError(e: any): void {
    console.log(e?.message ?? e);
  }

  public static log(
    message: string | number,
    color: keyof typeof this.colorMap
  ): void {
    const optionsString = `color: ${this.colorMap[color]}; font-weight: bold;`;

    console.log(`%c${message}`, optionsString);
  }

  /** removes passed node from the DOM */
  public static removeNode(nodeToRemove: HTMLGenericNode): void {
    nodeToRemove.parentNode?.removeChild(nodeToRemove);
  }

  /** removes all children from the passed node */
  public static removeChildNodes(node: HTMLGenericNode): void {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  public static doubleAnimationFramePromise(): Promise<void> {
    return new Promise((res) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => res());
      });
    });
  }

  public static sleepAsync(timeMs: number): Promise<void> {
    return new Promise((res) => {
      setTimeout(res, timeMs);
    });
  }

  public static async retry({
    cb,
    retryCount,
    retryWaitTime,
  }: {
    cb: Fn<any, Promise<boolean>>;
    retryCount: number;
    retryWaitTime: number;
  }): Promise<boolean> {
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

// this was added for no reason in particular
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Maybe {
  private value;

  constructor(value: any) {
    this.value = value;
  }

  _bind<T extends Fn<any, any>>(fn: T): Maybe {
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
function debounce({ cb, wait }: { cb: (...args: any) => void; wait: number }) {
  let timerId = -1;

  return function debouncedCb(...args: any) {
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
  private cb;
  private wait;

  private promise: Promise<unknown>;
  // @ts-expect-error typescript cannot see variable initialisation inside the constructor function
  private resolve: (value: unknown) => unknown;
  private timerId: number = -1;

  constructor({ cb, wait }: { cb: (...args: any) => any; wait: number }) {
    this.cb = cb;
    this.wait = wait;

    this.promise = new Promise((res) => {
      this.resolve = res;
    });
  }

  sub() {
    return this.promise;
  }

  do(...args: any) {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {
      const result = this.cb(...args);
      this.resolve(result);
    }, this.wait);
  }
}
