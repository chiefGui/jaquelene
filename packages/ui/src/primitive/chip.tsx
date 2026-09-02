import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { tokens } from "../theme.stylex";
import { Button, type ButtonProps } from "./button";

export type ChipStartEdge = "notched" | "rounded";
export type ChipEndEdge = "pointed" | "rounded";

type ChipEdgeProps = {
  compound?: boolean;
  endEdge?: ChipEndEdge;
  startEdge?: ChipStartEdge;
};

export type ChipActionProps = Omit<ButtonProps, "style" | "tone" | "variant"> &
  ChipEdgeProps & {
    style?: StyleXStyles;
  };

export type ChipFrameProps = Omit<ComponentProps<"span">, "className" | "style"> &
  ChipEdgeProps & {
    style?: StyleXStyles;
  };

export type ChipDividerProps = Omit<
  ComponentProps<"svg">,
  "aria-hidden" | "children" | "className" | "focusable" | "style"
> & {
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

function ChipDivider({ style, ...props }: ChipDividerProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 6 22"
      {...stylex.props(styles.divider, style)}
    >
      <path d="M0 0H1L6 11 1 22H0L5 11Z" fill="currentColor" />
    </svg>
  );
}

function ChipAngledEdge({ placement }: { placement: "end" | "start" }) {
  return (
    <ChipDivider
      style={[styles.angledEdge, placement === "start" ? styles.startEdge : styles.endEdge]}
    />
  );
}

function ChipAction({
  children,
  compound = false,
  endEdge = "rounded",
  startEdge = "rounded",
  style,
  ...props
}: ChipActionProps) {
  return (
    <Button
      {...props}
      variant="soft"
      style={[
        styles.root,
        edgeStyles[startEdge][endEdge],
        styles.action,
        compound && styles.compound,
        style,
      ]}
    >
      {renderChipChildren(children)}
      {!compound && startEdge === "notched" ? <ChipAngledEdge placement="start" /> : null}
      {!compound && endEdge === "pointed" ? <ChipAngledEdge placement="end" /> : null}
    </Button>
  );
}

function ChipFrame({
  children,
  compound = false,
  endEdge = "rounded",
  startEdge = "rounded",
  style,
  ...props
}: ChipFrameProps) {
  return (
    <span
      {...props}
      {...stylex.props(
        styles.root,
        edgeStyles[startEdge][endEdge],
        styles.frame,
        compound && styles.compound,
        style,
      )}
    >
      {renderChipChildren(children)}
      {!compound && startEdge === "notched" ? <ChipAngledEdge placement="start" /> : null}
      {!compound && endEdge === "pointed" ? <ChipAngledEdge placement="end" /> : null}
    </span>
  );
}

export const Chip = {
  Action: ChipAction,
  Divider: ChipDivider,
  Frame: ChipFrame,
  Label: ChipLabel,
} as const;

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    flexShrink: 1,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 400,
    height: "1.375rem",
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    maxWidth: "100%",
    minWidth: 0,
    paddingInline: "0.4375rem",
  },
  compound: {
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    height: "100%",
  },
  roundedPointed: {
    borderBottomRightRadius: 0,
    borderTopRightRadius: 0,
    clipPath: "polygon(0 0, calc(100% - 0.375rem) 0, 100% 50%, calc(100% - 0.375rem) 100%, 0 100%)",
    paddingRight: "0.8125rem",
  },
  notchedRounded: {
    borderBottomLeftRadius: 0,
    borderTopLeftRadius: 0,
    clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0.375rem 50%)",
    paddingLeft: "0.8125rem",
  },
  notchedPointed: {
    borderRadius: 0,
    clipPath:
      "polygon(0 0, calc(100% - 0.375rem) 0, 100% 50%, calc(100% - 0.375rem) 100%, 0 100%, 0.375rem 50%)",
    paddingLeft: "0.8125rem",
    paddingRight: "0.8125rem",
  },
  angled: {
    position: "relative",
  },
  divider: {
    color: tokens.surfaceRaisedBorder,
    display: "block",
    height: "1.375rem",
    pointerEvents: "none",
    width: "0.375rem",
  },
  angledEdge: {
    insetBlock: 0,
    position: "absolute",
    zIndex: 1,
  },
  startEdge: {
    left: 0,
  },
  endEdge: {
    right: 0,
  },
  frame: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  action: {
    borderColor: tokens.surfaceRaisedBorder,
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const edgeStyles = {
  notched: {
    pointed: [styles.notchedPointed, styles.angled],
    rounded: [styles.notchedRounded, styles.angled],
  },
  rounded: {
    pointed: [styles.roundedPointed, styles.angled],
    rounded: undefined,
  },
} satisfies Record<ChipStartEdge, Record<ChipEndEdge, StyleXStyles | undefined>>;
