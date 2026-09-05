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
type ButtonSize = "medium" | "small";
type ButtonShape = "rounded" | "squircle";

export type ButtonProps = Omit<AriakitButtonProps, "className" | "style"> & {
  shape?: ButtonShape;
  size?: ButtonSize;
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
  shape = "rounded",
  size = "medium",
  style,
  tone = "neutral",
  variant = "solid",
  ...props
}: ButtonProps) {
  return (
    <AriakitButton
      {...props}
      {...stylex.props(
        styles.root,
        shapeStyles[shape],
        sizeStyles[size],
        variantStyles[tone][variant],
        style,
      )}
    >
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
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 500,
    gap: "0.375rem",
    justifyContent: "center",
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
  },
  rounded: {
    borderRadius: radii.control,
  },
  squircle: {
    borderRadius: radii.compact,
  },
  medium: {
    fontSize: tokens.fontSizeSmall,
    height: tokens.controlHeight,
    lineHeight: tokens.lineHeightSmall,
    paddingInline: "0.75rem",
  },
  small: {
    fontSize: tokens.fontSizeXSmall,
    height: tokens.controlHeightSmall,
    lineHeight: tokens.lineHeightXSmall,
    paddingInline: "0.5rem",
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
      ':is([aria-expanded="true"])': colors.backgroundSelected,
      ':is([aria-expanded="true"]):not(:disabled):hover': colors.backgroundSelectedHover,
    },
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
      ':is([aria-expanded="true"])': colors.foregroundPrimary,
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

const sizeStyles = {
  medium: styles.medium,
  small: styles.small,
} satisfies Record<ButtonSize, StyleXStyles>;

const shapeStyles = {
  rounded: styles.rounded,
  squircle: styles.squircle,
} satisfies Record<ButtonShape, StyleXStyles>;

const variantStyles = {
  neutral: {
    ghost: styles.ghost,
    soft: styles.soft,
    solid: styles.solid,
  },
  danger: {
    ghost: styles.ghostDanger,
    soft: styles.softDanger,
    solid: styles.solidDanger,
  },
} satisfies Record<ButtonTone, Record<ButtonVariant, StyleXStyles>>;
