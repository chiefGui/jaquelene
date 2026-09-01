import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { colors, tokens } from "../tokens.stylex";

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
      ":is([data-focus-visible])": `color-mix(in oklch, ${colors.accent} 60%, transparent)`,
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
      default: `color-mix(in oklch, ${colors.foreground} 90%, transparent)`,
      ":not(:disabled):hover": colors.foreground,
    },
    color: colors.canvas,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklch, ${colors.accent} 10%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${colors.accent} 10%, transparent)`,
    },
    color: {
      default: colors.muted,
      ":not(:disabled):hover": colors.foreground,
      ":is([data-focus-visible])": colors.foreground,
    },
  },
  soft: {
    backgroundColor: {
      default: `color-mix(in oklch, ${colors.accent} 8%, transparent)`,
      ":not(:disabled):hover": `color-mix(in oklch, ${colors.accent} 12%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${colors.accent} 12%, transparent)`,
    },
    color: {
      default: colors.muted,
      ":not(:disabled):hover": colors.foreground,
      ":is([data-focus-visible])": colors.foreground,
    },
  },
  solidDanger: {
    backgroundColor: {
      default: `color-mix(in oklch, ${colors.danger} 82%, ${colors.canvas})`,
      ":not(:disabled):hover": colors.danger,
    },
    color: colors.canvas,
  },
  ghostDanger: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklch, ${colors.danger} 8%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${colors.danger} 8%, transparent)`,
    },
    color: {
      default: `color-mix(in oklab, ${colors.danger} 72%, ${colors.muted})`,
      ":not(:disabled):hover": colors.danger,
      ":is([data-focus-visible])": colors.danger,
    },
  },
  softDanger: {
    backgroundColor: {
      default: `color-mix(in oklch, ${colors.danger} 8%, transparent)`,
      ":not(:disabled):hover": `color-mix(in oklch, ${colors.danger} 12%, transparent)`,
      ":is([data-focus-visible])": `color-mix(in oklch, ${colors.danger} 12%, transparent)`,
    },
    color: {
      default: colors.danger,
      ":not(:disabled):hover": `color-mix(in oklab, ${colors.danger} 82%, ${colors.foreground})`,
      ":is([data-focus-visible])": `color-mix(in oklab, ${colors.danger} 82%, ${colors.foreground})`,
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
