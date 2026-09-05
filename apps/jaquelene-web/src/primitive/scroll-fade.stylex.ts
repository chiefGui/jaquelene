import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

export const scrollFade = stylex.create({
  start: {
    isolation: "isolate",
    "::before": {
      // Preserve the surface hue at every stop, including the fully transparent endpoint.
      backgroundImage: `linear-gradient(to bottom in oklch, ${colors.backgroundSurface}, oklch(from ${colors.backgroundSurface} l c h / 90%) 20%, oklch(from ${colors.backgroundSurface} l c h / 65%) 40%, oklch(from ${colors.backgroundSurface} l c h / 35%) 60%, oklch(from ${colors.backgroundSurface} l c h / 10%) 80%, oklch(from ${colors.backgroundSurface} l c h / 0%))`,
      content: '""',
      display: "block",
      height: "var(--scroll-fade-height, 0px)",
      // Cancel the decorative box's height so content and scroll geometry stay intact.
      marginBlockEnd: "calc(-1 * var(--scroll-fade-height, 0px))",
      pointerEvents: "none",
      position: "sticky",
      top: 0,
      zIndex: 2,
    },
  },
});
