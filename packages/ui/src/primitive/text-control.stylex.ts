import * as stylex from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

export const textControl = stylex.create({
  root: {
    appearance: "none",
    caretColor: colors.foregroundAccent,
    "::placeholder": {
      color: tokens.controlPlaceholderColor,
      opacity: 1,
    },
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
});
