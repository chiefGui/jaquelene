import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { colors, radii, shadows, tokens } from "../tokens.stylex";
import { Button, type ButtonProps } from "./button";

export type ChipActionProps = Omit<ButtonProps, "shape" | "size" | "style" | "tone" | "variant"> & {
  style?: StyleXStyles;
};

export type ChipFrameProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

type ChipLabelProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

function ChipLabel({ style, ...props }: ChipLabelProps) {
  return <span {...props} {...stylex.props(styles.label, style)} />;
}

function renderChipChildren(children: ReactNode) {
  return typeof children === "string" || typeof children === "number" ? (
    <ChipLabel>{children}</ChipLabel>
  ) : (
    children
  );
}

function ChipAction({ children, style, ...props }: ChipActionProps) {
  return (
    <Button {...props} variant="soft" style={[styles.root, styles.action, style]}>
      {renderChipChildren(children)}
    </Button>
  );
}

function ChipFrame({ children, style, ...props }: ChipFrameProps) {
  return (
    <span {...props} {...stylex.props(styles.root, styles.frame, style)}>
      {renderChipChildren(children)}
    </span>
  );
}

export const Chip = {
  Action: ChipAction,
  Frame: ChipFrame,
  Label: ChipLabel,
} as const;

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderRadius: radii.compact,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    flexShrink: 1,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 400,
    height: tokens.controlHeightSmall,
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    maxWidth: "100%",
    minWidth: 0,
    paddingInline: "0.4375rem",
  },
  frame: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  action: {
    borderColor: colors.borderDefault,
    boxShadow: shadows.control,
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
