import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { colors, radii, tokens } from "../tokens.stylex";

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
    borderRadius: radii.control,
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
      default: colors.buttonSolidBackground,
      ":not(:disabled):hover": colors.buttonSolidBackgroundHover,
    },
    color: colors.buttonSolidForeground,
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": colors.backgroundInteractive,
      ":not(:disabled):active": colors.backgroundSelected,
      ":is([data-focus-visible])": colors.backgroundInteractive,
    },
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
    },
  },
  soft: {
    backgroundColor: {
      default: colors.buttonSoftBackground,
      ":not(:disabled):hover": colors.buttonSoftBackgroundHover,
      ":not(:disabled):active": colors.buttonSoftBackgroundHover,
      ":is([data-focus-visible])": colors.buttonSoftBackgroundHover,
    },
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
    },
  },
  solidDanger: {
    backgroundColor: {
      default: colors.buttonDangerSolidBackground,
      ":not(:disabled):hover": colors.buttonDangerSolidBackgroundHover,
    },
    color: colors.buttonDangerSolidForeground,
  },
  ghostDanger: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": colors.buttonDangerSubtleBackground,
      ":not(:disabled):active": colors.buttonDangerSubtleBackgroundStrong,
      ":is([data-focus-visible])": colors.buttonDangerSubtleBackground,
    },
    color: {
      default: colors.foregroundDanger,
      ":not(:disabled):hover": colors.foregroundDanger,
      ":is([data-focus-visible])": colors.foregroundDanger,
    },
  },
  softDanger: {
    backgroundColor: {
      default: colors.buttonDangerSubtleBackground,
      ":not(:disabled):hover": colors.buttonDangerSubtleBackgroundStrong,
      ":not(:disabled):active": colors.buttonDangerSubtleBackgroundStrong,
      ":is([data-focus-visible])": colors.buttonDangerSubtleBackgroundStrong,
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
