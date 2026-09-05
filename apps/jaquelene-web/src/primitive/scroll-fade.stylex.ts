import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

export const scrollFade = stylex.create({
  start: {
    isolation: "isolate",
    "::before": {
      backgroundImage: `linear-gradient(to bottom in oklch, ${colors.backgroundSurface}, color-mix(in oklch, ${colors.backgroundSurface} 90%, transparent) 20%, color-mix(in oklch, ${colors.backgroundSurface} 65%, transparent) 40%, color-mix(in oklch, ${colors.backgroundSurface} 35%, transparent) 60%, color-mix(in oklch, ${colors.backgroundSurface} 10%, transparent) 80%, transparent)`,
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
