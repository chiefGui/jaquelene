import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { tokens } from "../theme.stylex";

type ButtonVariant = "ghost" | "soft" | "solid";
type ButtonTone = "danger" | "neutral";

export type ButtonProps = Omit<AriakitButtonProps, "className" | "style"> & {
  style?: StyleXStyles;
  tone?: ButtonTone;
  variant?: ButtonVariant;
};

type ButtonLabelProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

function ButtonLabel({ style, ...props }: ButtonLabelProps) {
  return <span {...props} {...stylex.props(styles.label, style)} />;
}

function ButtonRoot({
  children,
  style,
  tone = "neutral",
  variant = "solid",
  ...props
}: ButtonProps) {
  const toneStyle = tone === "danger" ? dangerStyles[variant] : undefined;

  return (
    <AriakitButton {...props} {...stylex.props(styles.root, styles[variant], toneStyle, style)}>
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
      ":is([data-focus-visible])": `color-mix(in oklch, ${tokens.accent} 60%, transparent)`,
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
      default: `color-mix(in oklch, ${tokens.foreground} 90%, transparent)`,
      ":not(:disabled):hover": tokens.foreground,
    },
    color: tokens.canvas,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklch, ${tokens.accent} 10%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${tokens.accent} 10%, transparent)`,
    },
    color: {
      default: tokens.muted,
      ":not(:disabled):hover": tokens.foreground,
      ":is([data-focus-visible])": tokens.foreground,
    },
  },
  soft: {
    backgroundColor: {
      default: `color-mix(in oklch, ${tokens.accent} 8%, transparent)`,
      ":not(:disabled):hover": `color-mix(in oklch, ${tokens.accent} 12%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${tokens.accent} 12%, transparent)`,
    },
    color: {
      default: tokens.muted,
      ":not(:disabled):hover": tokens.foreground,
      ":is([data-focus-visible])": tokens.foreground,
    },
  },
  solidDanger: {
    backgroundColor: {
      default: `color-mix(in oklch, ${tokens.danger} 82%, ${tokens.canvas})`,
      ":not(:disabled):hover": tokens.danger,
    },
    color: tokens.canvas,
  },
  ghostDanger: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklch, ${tokens.danger} 8%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${tokens.danger} 8%, transparent)`,
    },
    color: {
      default: `color-mix(in oklab, ${tokens.danger} 72%, ${tokens.muted})`,
      ":not(:disabled):hover": tokens.danger,
      ":is([data-focus-visible])": tokens.danger,
    },
  },
  softDanger: {
    backgroundColor: {
      default: `color-mix(in oklch, ${tokens.danger} 8%, transparent)`,
      ":not(:disabled):hover": `color-mix(in oklch, ${tokens.danger} 12%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${tokens.danger} 12%, transparent)`,
    },
    color: {
      default: tokens.danger,
      ":not(:disabled):hover": `color-mix(in oklab, ${tokens.danger} 82%, ${tokens.foreground})`,
      ":is([data-focus-visible])": `color-mix(in oklab, ${tokens.danger} 82%, ${tokens.foreground})`,
    },
  },
  label: {
    textBox: "trim-both text",
  },
});

const dangerStyles = {
  ghost: styles.ghostDanger,
  soft: styles.softDanger,
  solid: styles.solidDanger,
} satisfies Record<ButtonVariant, StyleXStyles>;
