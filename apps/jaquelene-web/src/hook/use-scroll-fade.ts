import { useLayoutEffect, type RefObject } from "react";

const maximumFadeHeight = 40;
const fadeHeightProperty = "--scroll-fade-height";

export function useScrollFade(viewport: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !enabled) return;
    let previousHeight = -1;

    function synchronize() {
      if (!element) return;
      const height = Math.max(0, Math.min(element.scrollTop, maximumFadeHeight));
      if (height === previousHeight) return;
      previousHeight = height;
      element.style.setProperty(fadeHeightProperty, `${height}px`);
    }

    synchronize();
    element.addEventListener("scroll", synchronize, { passive: true });
    return () => {
      element.removeEventListener("scroll", synchronize);
      element.style.removeProperty(fadeHeightProperty);
    };
  }, [enabled, viewport]);
}
