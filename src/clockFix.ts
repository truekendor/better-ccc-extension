/** fixes the clock SVG near the timer */
function fixClockSVG() {
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
    const clock = brokenClockWrapper.firstElementChild! as HTMLObjectElement;
    const remainingTime =
      brokenClockWrapper.lastElementChild! as HTMLSpanElement;

    const clockSVG = SVG.Icons.clock;
    clockSVG.classList.add("ccc-clock");

    if (i === 1) {
      clockSVG.classList.add("ccc-clock-black");
    }

    brokenClockWrapper.insertBefore(clockSVG, remainingTime);
    clock.classList.add("ccc-hide");

    const clockVisibilityObserver = new MutationObserver(() => {
      clockVisibilityObserver.disconnect();

      clock.classList.add("ccc-hide");
      clockSVG.classList.add("ccc-hide");

      const isHidden = clock.classList.contains("visibility-hidden");

      const command = isHidden ? "add" : "remove";
      clockSVG.classList[command]("ccc-hide");

      clockVisibilityObserver.observe(clock, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class"],
      });
    });

    clockVisibilityObserver.observe(clock, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"],
    });

    const timerTickObserver = new MutationObserver(() => {
      clock.classList.add("ccc-hide");
      clockSVG.style.transform = clock.style.transform;

      const isHidden = clock.classList.contains("visibility-hidden");
      const command = isHidden ? "add" : "remove";
      clockSVG.classList[command]("ccc-hide");
    });

    timerTickObserver.observe(remainingTime, {
      characterData: true,
      subtree: true,
    });
  });
}
