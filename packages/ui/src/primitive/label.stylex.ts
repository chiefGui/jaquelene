import * as stylex from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

export const labelStyles = stylex.create({
  label: {
    color: `color-mix(in oklch, ${colors.foregroundPrimary} 40%, ${colors.foregroundSecondary})`,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  optional: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    fontWeight: 400,
    marginInlineStart: "0.375rem",
    opacity: 0.8,
  },
});
