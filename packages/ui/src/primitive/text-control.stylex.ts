import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

export const textControl = stylex.create({
  root: {
    appearance: "none",
    caretColor: colors.foregroundAccent,
    "::placeholder": {
      color: colors.foregroundSecondary,
    },
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
});
