import { tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

const headerHeight = "2.75rem";

export const shellChrome = stylex.create({
  header: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: headerHeight,
    minWidth: 0,
    paddingInlineEnd: `calc((${headerHeight} - ${tokens.controlHeight}) / 2)`,
  },
});
