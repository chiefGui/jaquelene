import { colors, radii } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

export const paneSurface = stylex.create({
  root: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
    borderStyle: "solid",
    borderWidth: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
});
