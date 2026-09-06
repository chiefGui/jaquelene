import { tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { shellLayout } from "./layout-tokens.stylex";

export const shellChrome = stylex.create({
  header: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: shellLayout.headerHeight,
    minWidth: 0,
    paddingInlineEnd: `calc((${shellLayout.headerHeight} - ${tokens.controlHeight}) / 2)`,
  },
});
