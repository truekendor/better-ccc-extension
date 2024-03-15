// eslint-disable-next-line @typescript-eslint/no-unused-vars
{
  (function removeChatBanner() {
    if (ExtractPageData.isMobile) {
      return;
    }
    const chatWrapper: HTMLDivElement = document.querySelector(
      "#righttable-righttable"
    )!;

    const twitchIFrame = chatWrapper.querySelector("iframe")!;
    const banner = chatWrapper.querySelector("div")!;
    if (banner.getAttribute("id")) {
      return;
    }

    chatWrapper.removeChild(banner);

    twitchIFrame.style.top = "0";
  })();
}
