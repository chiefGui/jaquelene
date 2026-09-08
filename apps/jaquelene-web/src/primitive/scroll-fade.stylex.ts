import { colors } from "@jaquelene/ui/tokens.stylex";
import { edgeFadeMasks } from "@jaquelene/ui/edge-fade.stylex";
import * as stylex from "@stylexjs/stylex";

export const scrollFade = stylex.create({
  start: {
    isolation: "isolate",
    "::before": {
      "--edge-fade-size": "100%",
      backgroundColor: colors.backgroundSurface,
      maskImage: edgeFadeMasks.end,
      content: '""',
      display: "block",
      height: "var(--scroll-fade-height, 0px)",
      marginBlockEnd: "calc(-1 * var(--scroll-fade-height, 0px))",
      pointerEvents: "none",
      position: "sticky",
      top: 0,
      zIndex: 2,
    },
  },
});
