import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";

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
      default: `color-mix(in oklab, ${tokens.foreground} 3.5%, transparent)`,
      ":focus": `color-mix(in oklab, ${tokens.foreground} 5%, transparent)`,
    },
    borderColor: {
      default: `color-mix(in oklab, ${tokens.foreground} 10%, transparent)`,
      ":focus": `color-mix(in oklab, ${tokens.accent} 45%, transparent)`,
      ':is([aria-invalid="true"])': `color-mix(in oklab, ${tokens.danger} 58%, transparent)`,
      ':is([aria-invalid="true"]):focus': `color-mix(in oklab, ${tokens.danger} 72%, transparent)`,
    },
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    caretColor: tokens.accent,
    color: tokens.foreground,
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
      color: tokens.muted,
    },
  },
});
