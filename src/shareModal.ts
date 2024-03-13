// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ShareModal {
  // todo rename and add description
  static just_do_it() {
    this.updateFENAndListen();
    this.addGameLogsBtn();

    // click-outside-to-close for settings modal
    const settingsModal: HTMLDivElement | null =
      _DOM_Store.mainContainer.querySelector(".modal-container-component");

    if (!settingsModal) return;
    const modalContent = settingsModal.querySelector("section")!;

    modalContent.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    settingsModal.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();

        const closeBtn = settingsModal.querySelector("button")!;
        closeBtn.click();
      },
      { once: true }
    );
  }

  static updateFEN(): Maybe {
    const shareModal = _DOM_Store.mainContainer.querySelector(
      ".ui_modal-component"
    );
    if (!shareModal) return new Maybe(null);

    return new Maybe(shareModal.querySelector(".share-menu-content"))
      ._bind((container) => {
        return container.querySelector(".share-menu-tab-pgn-section");
      })
      ._bind((container) => {
        return container.querySelector("input");
      })
      ._bind((input: HTMLInputElement) => {
        const currentMoveNumber = ExtractPageData.getMoveNumber();
        const fen = chessCurrent.actions.getFullFenAtIndex(currentMoveNumber);

        input.value = fen || input.value;

        return input;
      });
  }

  static updateFENAndListen() {
    this.updateFEN()._bind(this.addListenersToFEN);
  }

  private static addListenersToFEN(input: HTMLInputElement): Maybe {
    const listenerAdded = input.getAttribute("data-listener-added");

    if (!listenerAdded) {
      input.setAttribute("data-listener-added", "true");

      input.addEventListener("keydown", (e) => {
        if (!e.code.toLowerCase().startsWith("arrow")) return;

        e.stopPropagation();
      });
    }

    return new Maybe(null);
  }

  private static addGameLogsBtn(): Maybe {
    return new Maybe(document.querySelector(".ui_modal-component"))
      ._bind((modal: HTMLDivElement) => {
        const btn = modal.querySelector(".ccc-download-logs-btn");
        if (btn) return null;

        return modal.querySelector(".share-menu-content");
      })
      ._bind((modalContent: HTMLDivElement) => {
        const menu = modalContent.children[0];

        return menu;
      })
      ._bind(async (container: HTMLDivElement) => {
        const btn = document.createElement("a");

        btn.classList.add("ccc-download-logs-btn");

        btn.textContent = "Download game logs";
        btn.target = "_blank";
        btn.rel = "noopener";

        btn.setAttribute("download", "");

        const archiveLink = container.getAttribute("event-url");
        if (!archiveLink) return container;

        const gameNumber = await ExtractPageData.getCurrentGameNumber();
        const eventId = +archiveLink
          .split("/")
          .filter((el) => {
            const includes = el.includes(".pgn");
            if (!includes) return;
            return el;
          })[0]
          // returns tournament-${tournament-id}.pgn
          .split(".")[0]
          .split("-")[1];

        const link = `https://cccfiles.chess.com/archive/cutechess.debug-${eventId}-${
          eventId + +gameNumber
        }.zip`;

        btn.href = link;

        container.append(btn);

        return container;
      });
  }
}
