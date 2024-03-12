/** fixes the clock SVG near the timer */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fixClockSVG(): void {
  // main wrapper with 50MRule and broken container of clock.svg
  const containers: HTMLDivElement[] = Array.from(
    document.querySelectorAll(".enginedata-clock-wrapper")!
  );

  containers.forEach((container, i) => {
    const cccClock = container.querySelector(".ccc-clock");
    if (cccClock) return;

    // container with broken <object> element && <span> with remaining time
    const brokenClockWrapper = container.lastElementChild!;

    // broken <object> element
    const clockElement =
      brokenClockWrapper.firstElementChild! as HTMLObjectElement;
    const remainingTimeElement =
      brokenClockWrapper.lastElementChild! as HTMLSpanElement;

    const clockSVG = SVG.Icons.clock;
    clockSVG.classList.add("ccc-clock");

    if (i === 1) {
      clockSVG.classList.add("ccc-clock-black");
    }

    brokenClockWrapper.insertBefore(clockSVG, remainingTimeElement);
    clockElement.classList.add("ccc-hide");

    const clockVisibilityObserver = new MutationObserver(() => {
      clockVisibilityObserver.disconnect();

      clockElement.classList.add("ccc-hide");
      clockSVG.classList.add("ccc-hide");

      const isHidden = clockElement.classList.contains("visibility-hidden");

      const command = isHidden ? "add" : "remove";
      clockSVG.classList[command]("ccc-hide");

      clockVisibilityObserver.observe(clockElement, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class"],
      });
    });

    clockVisibilityObserver.observe(clockElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"],
    });

    const timerTickObserver = new MutationObserver(() => {
      clockElement.classList.add("ccc-hide");
      clockSVG.style.transform = clockElement.style.transform;

      const isHidden = clockElement.classList.contains("visibility-hidden");
      const command = isHidden ? "add" : "remove";
      clockSVG.classList[command]("ccc-hide");
    });

    timerTickObserver.observe(clockElement, {
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  });
}
