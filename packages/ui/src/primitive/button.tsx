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
      ":is([data-focus-visible])": colors.focusRing,
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
      default: colors.backgroundAccentBold,
      ":not(:disabled):hover": colors.backgroundAccentBoldHover,
    },
    color: colors.foregroundOnAccent,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": colors.backgroundNeutralSubtler,
      ":not(:disabled):active": colors.backgroundNeutralSubtle,
      ":is([data-focus-visible])": colors.backgroundNeutralSubtler,
    },
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
    },
  },
  soft: {
    backgroundColor: {
      default: colors.backgroundNeutralSubtlest,
      ":not(:disabled):hover": colors.backgroundNeutralSubtler,
      ":not(:disabled):active": colors.backgroundNeutralSubtle,
      ":is([data-focus-visible])": colors.backgroundNeutralSubtler,
    },
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
    },
  },
  solidDanger: {
    backgroundColor: {
      default: colors.backgroundDangerBold,
      ":not(:disabled):hover": colors.backgroundDangerBoldHover,
    },
    color: colors.foregroundOnDanger,
  },
  ghostDanger: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": colors.backgroundDangerSubtlest,
      ":not(:disabled):active": colors.backgroundDangerSubtle,
      ":is([data-focus-visible])": colors.backgroundDangerSubtlest,
    },
    color: {
      default: colors.foregroundDanger,
      ":not(:disabled):hover": colors.foregroundDanger,
      ":is([data-focus-visible])": colors.foregroundDanger,
    },
  },
  softDanger: {
    backgroundColor: {
      default: colors.backgroundDangerSubtlest,
      ":not(:disabled):hover": colors.backgroundDangerSubtle,
      ":not(:disabled):active": colors.backgroundDangerSubtle,
      ":is([data-focus-visible])": colors.backgroundDangerSubtle,
    },
    color: {
      default: colors.foregroundDanger,
      ":not(:disabled):hover": colors.foregroundDanger,
      ":is([data-focus-visible])": colors.foregroundDanger,
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
