import {
  Toolbar as AriakitToolbar,
  ToolbarItem,
  type ToolbarProps as AriakitToolbarProps,
} from "@ariakit/react/toolbar";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

export type ToolbarProps = Omit<AriakitToolbarProps, "className" | "style"> & {
  style?: StyleXStyles;
};

function Root({ style, ...props }: ToolbarProps) {
  return <AriakitToolbar {...props} {...stylex.props(styles.root, style)} />;
}

export const Toolbar = { Root, Item: ToolbarItem } as const;

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flexDirection: {
      default: "row",
      ':is([aria-orientation="vertical"])': "column",
    },
    gap: "0.25rem",
  },
});
