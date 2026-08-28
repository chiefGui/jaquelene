import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { tokens } from "../theme.stylex";

type ButtonVariant = "ghost" | "solid";

export type ButtonProps = Omit<AriakitButtonProps, "className" | "style"> & {
  style?: StyleXStyles;
  variant?: ButtonVariant;
};

type ButtonLabelProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

function ButtonLabel({ style, ...props }: ButtonLabelProps) {
  return <span {...props} {...stylex.props(styles.label, style)} />;
}

function ButtonRoot({ children, style, variant = "solid", ...props }: ButtonProps) {
  return (
    <AriakitButton {...props} {...stylex.props(styles.root, styles[variant], style)}>
      {typeof children === "string" || typeof children === "number" ? (
        <ButtonLabel>{children}</ButtonLabel>
      ) : (
        children
      )}
    </AriakitButton>
  );
}

export const Button = Object.assign(ButtonRoot, { Label: ButtonLabel });

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderRadius: tokens.radiusMedium,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    height: tokens.controlHeight,
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    opacity: {
      default: 1,
      ":disabled": 0.5,
      ':is([aria-disabled="true"])': 0.5,
    },
    outlineColor: {
      default: null,
      ":is([data-focus-visible])": `color-mix(in oklab, ${tokens.accent} 60%, transparent)`,
    },
    outlineOffset: {
      default: null,
      ":is([data-focus-visible])": 2,
    },
    outlineStyle: {
      default: "none",
      ":is([data-focus-visible])": "solid",
    },
    outlineWidth: {
      default: null,
      ":is([data-focus-visible])": 1,
    },
    paddingInline: "0.75rem",
  },
  solid: {
    backgroundColor: {
      default: `color-mix(in oklab, ${tokens.foreground} 90%, transparent)`,
      ":not(:disabled):hover": tokens.foreground,
    },
    color: tokens.canvas,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklab, ${tokens.accent} 10%, transparent)`,
    },
  },
  label: {
    textBox: "trim-both text",
  },
});
