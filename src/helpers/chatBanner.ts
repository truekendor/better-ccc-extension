// eslint-disable-next-line @typescript-eslint/no-unused-vars
function removeChatBanner() {
  const chatWrapper: HTMLDivElement = document.querySelector(
    "#righttable-righttable"
  )!;

  const twitchIFrame = chatWrapper.querySelector("iframe")!;
  const banner = chatWrapper.querySelector("div")!;

  chatWrapper.removeChild(banner);

  twitchIFrame.style.top = "0";
}
