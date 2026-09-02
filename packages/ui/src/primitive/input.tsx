import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, radii, shadows, tokens } from "../tokens.stylex";

type InputVariant = "ghost" | "raised";

export type InputProps = Omit<RoleProps<"input">, "className" | "render" | "style"> & {
  style?: StyleXStyles;
  variant?: InputVariant;
};

export function Input({ style, variant = "raised", ...props }: InputProps) {
  return <Role.input {...props} {...stylex.props(styles.root, styles[variant], style)} />;
}

const styles = stylex.create({
  root: {
    appearance: "none",
    caretColor: colors.foregroundAccent,
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeBase,
    height: tokens.controlHeight,
    lineHeight: tokens.lineHeightBase,
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
  raised: {
    backgroundColor: colors.backgroundSurfaceRaised,
    borderColor: {
      default: colors.borderDefault,
      ":focus": colors.borderFocus,
      ':is([aria-invalid="true"])': colors.borderDanger,
      ':is([aria-invalid="true"]):focus': colors.borderDangerFocus,
    },
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.control,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
});
