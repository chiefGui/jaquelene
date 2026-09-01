import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { colors, tokens } from "../tokens.stylex";

export type BadgeProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

export function Badge({ style, ...props }: BadgeProps) {
  return <span {...props} {...stylex.props(styles.root, style)} />;
}

const styles = stylex.create({
  root: {
    borderColor: colors.border,
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.muted,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
    whiteSpace: "nowrap",
  },
});
