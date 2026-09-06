import * as stylex from "@stylexjs/stylex";
import { colors, radii, shadows, tokens } from "../tokens.stylex";

export const control = stylex.create({
  root: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    height: tokens.controlHeight,
    lineHeight: tokens.lineHeightSmall,
    opacity: {
      default: 1,
      ":disabled": 0.5,
      ':is([aria-disabled="true"])': 0.5,
    },
    outline: "none",
    paddingInline: "0.625rem",
  },
  filled: {
    backgroundColor: {
      default: colors.backgroundNeutralSubtlest,
      ':not(:disabled):not([aria-disabled="true"]):not([data-disabled="true"]):not([readonly]):not([data-readonly="true"]):hover':
        colors.backgroundInteractive,
    },
    borderColor: {
      default: colors.borderDefault,
      ':is(:focus-within, [data-focus-visible], [aria-expanded="true"])': colors.borderFocus,
      ':is([aria-invalid="true"], [data-invalid="true"])': colors.borderDanger,
      ':is([aria-invalid="true"], [data-invalid="true"]):is(:focus-within, [data-focus-visible], [aria-expanded="true"])':
        colors.borderDangerFocus,
    },
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.control,
  },
});
