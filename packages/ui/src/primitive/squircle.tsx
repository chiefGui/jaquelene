import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

export type SquircleProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

export function Squircle({ style, ...props }: SquircleProps) {
  return <span {...props} {...stylex.props(styles.root, style)} />;
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderRadius: "50%",
    cornerShape: "squircle",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
});
