import { useLayoutEffect } from "react";

const maximumFadeHeight = 40;
const fadeHeightProperty = "--scroll-fade-height";

export function useScrollFade(element: HTMLElement | null, enabled = true) {
  useLayoutEffect(() => {
    if (!element || !enabled) return;
    let previousHeight = -1;

    const synchronize = () => {
      const height = Math.max(0, Math.min(element.scrollTop, maximumFadeHeight));
      if (height === previousHeight) return;
      previousHeight = height;
      element.style.setProperty(fadeHeightProperty, `${height}px`);
    };

    synchronize();
    element.addEventListener("scroll", synchronize, { passive: true });
    return () => {
      element.removeEventListener("scroll", synchronize);
      element.style.removeProperty(fadeHeightProperty);
    };
  }, [enabled, element]);
}
