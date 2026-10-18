/**
 * Runs in the page (injected by highlightDeviation.js as a <script>), not in
 * the extension's content scripts: forwards CCC's websocket results to them.
 *
 * The CCC app keeps its socket on `#app.__vue_app__.config.globalProperties
 * .$socket`. For every message type of a frame, it calls
 * `handlers[type](message)` then `handlers["after_" + type](messages)`; the
 * app registers no `after_*` handler, so `after_result` and
 * `after_gameUpdate` are added here (chained to any existing one):
 * - `result` {whiteName, blackName, score, reason}: ~0.2 s after the last
 *   move of the live game
 * - `gameUpdate` {gameDetails: {gameNr, live?, termination, outcome, pgn}}:
 *   `live` at the start of a game, without it for a finished game (the
 *   live one ~14 s after its end, or an archived game opened by the user)
 *
 * Posted as `{ source: "better-ccc-page", type, json }` (json: a JSON
 * string, read by GameEndRules.parsePageMessage).
 *
 * The hooks are checked again every few seconds: if the app replaces its
 * handlers (or its socket object), they are put back, never twice.
 */
(function installGameEndHook(): void {
  type SocketHandler = ((messages: unknown) => void) & { __betterCccGameEnd?: true };
  type CccSocket = {
    handlers?: Record<string, SocketHandler | undefined>;
  };
  type AppElement = Element & {
    __vue_app__?: { config?: { globalProperties?: { $socket?: CccSocket } } };
  };

  const SOURCE = "better-ccc-page";
  const RETRY_MS = 500;
  /** the app is wired within seconds: give up after 10 minutes */
  const MAX_TRIES = 1200;
  /** once installed: how often the hooks are checked */
  const CHECK_MS = 5000;

  let tries = 0;
  let installed = false;

  const isOurs = (handler: unknown): boolean =>
    typeof handler === "function" &&
    (handler as SocketHandler).__betterCccGameEnd === true;

  const ours = (handler: (messages: unknown) => void): SocketHandler => {
    const marked = handler as SocketHandler;
    marked.__betterCccGameEnd = true;
    return marked;
  };

  const findSocket = (): CccSocket | null => {
    const app = document.querySelector("#app") as AppElement | null;
    return app?.__vue_app__?.config?.globalProperties?.$socket ?? null;
  };

  const text = (value: unknown): string =>
    typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

  const pgnHeader = (pgn: string, name: string): string =>
    pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`))?.[1] ?? "";

  /** only what the content scripts need, no PGN */
  const summaries: Record<string, (message: Record<string, unknown>) => unknown> = {
    result: (message) => ({
      whiteName: text(message.whiteName),
      blackName: text(message.blackName),
      score: text(message.score),
      reason: text(message.reason),
    }),
    gameUpdate: (message) => {
      const details = (message.gameDetails ?? {}) as Record<string, unknown>;
      const pgn = text(details.pgn);
      const plyCount = parseInt(pgnHeader(pgn, "PlyCount"), 10);

      return {
        gameNr: text(details.gameNr),
        live: details.live === true,
        termination: text(details.termination),
        outcome: text(details.outcome),
        white: pgnHeader(pgn, "White"),
        black: pgnHeader(pgn, "Black"),
        plyCount: Number.isFinite(plyCount) ? plyCount : null,
      };
    },
  };

  const post = (type: string, message: unknown): void => {
    if (!message || typeof message !== "object") {
      return;
    }

    const summary = summaries[type]?.(message as Record<string, unknown>);
    window.postMessage(
      { source: SOURCE, type, json: JSON.stringify(summary) },
      window.location.origin
    );
  };

  /** `after_<type>`, chained to the app's own one if any */
  const hook = (handlers: Record<string, SocketHandler | undefined>, type: string): void => {
    const key = `after_${type}`;
    const previous = handlers[key];

    if (isOurs(previous)) {
      return;
    }

    handlers[key] = ours((messages: unknown) => {
      try {
        previous?.(messages);
      } finally {
        try {
          for (const message of Array.isArray(messages) ? messages : [messages]) {
            post(type, message);
          }
        } catch {
          // never break the app's socket
        }
      }
    });
  };

  /** false while the app isn't wired */
  const install = (): boolean => {
    const handlers = findSocket()?.handlers;

    if (!handlers || typeof handlers.newMove !== "function") {
      return false;
    }

    // the app has no `result` handler: be it (a missing main handler could
    // keep the `after_` ones from running); if it has one, follow it
    if (typeof handlers.result !== "function") {
      handlers.result = ours((message: unknown) => {
        try {
          post("result", message);
        } catch {
          // never break the app's socket
        }
      });
    } else if (!isOurs(handlers.result)) {
      hook(handlers, "result");
    }
    hook(handlers, "gameUpdate");

    return true;
  };

  const tryInstall = (): void => {
    try {
      installed = install() || installed;
    } catch {
      // not the CCC app
    }

    tries += 1;
    if (installed) {
      window.setTimeout(tryInstall, CHECK_MS);
    } else if (tries < MAX_TRIES) {
      window.setTimeout(tryInstall, RETRY_MS);
    }
  };

  tryInstall();
})();
