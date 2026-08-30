import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { tokens } from "../theme.stylex";
import { Button, type ButtonProps } from "./button";

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "children" | "style" | "variant"> & {
  "aria-label": string;
  children: ReactNode;
  style?: StyleXStyles;
};

export function IconButton({ style, ...props }: IconButtonProps) {
  return <Button {...props} variant="ghost" style={[styles.root, style]} />;
}

const styles = stylex.create({
  root: {
    color: tokens.muted,
    paddingInline: 0,
    width: tokens.controlHeight,
  },
});
