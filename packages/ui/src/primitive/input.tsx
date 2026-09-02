import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

export type InputProps = Omit<RoleProps<"input">, "className" | "render" | "style"> & {
  style?: StyleXStyles;
};

export function Input({ style, ...props }: InputProps) {
  return <Role.input {...props} {...stylex.props(styles.root, style)} />;
}

const styles = stylex.create({
  root: {
    appearance: "none",
    backgroundColor: {
      default: colors.backgroundNeutralSubtlest,
      ":focus": colors.backgroundNeutralSubtler,
    },
    borderColor: {
      default: colors.borderDefault,
      ":focus": colors.borderFocus,
      ':is([aria-invalid="true"])': colors.borderDanger,
      ':is([aria-invalid="true"]):focus': colors.borderDangerFocus,
    },
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    caretColor: colors.foregroundAccent,
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    height: tokens.controlHeight,
    lineHeight: tokens.lineHeightSmall,
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    outline: "none",
    paddingInline: "0.625rem",
    "::placeholder": {
      color: colors.foregroundSecondary,
    },
  },
});
