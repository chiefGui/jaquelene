import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

export type IconFrameProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

export function IconFrame({ style, ...props }: IconFrameProps) {
  return <span {...props} {...stylex.props(styles.root, style)} />;
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    aspectRatio: "1",
    borderRadius: "25%",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
});
