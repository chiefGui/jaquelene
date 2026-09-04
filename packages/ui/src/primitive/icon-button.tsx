import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { tokens } from "../tokens.stylex";
import { Button, type ButtonProps } from "./button";

type IconButtonSize = Exclude<ButtonProps["size"], undefined>;

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "children" | "style" | "variant"> & {
  "aria-label": string;
  children: ReactNode;
  style?: StyleXStyles;
};

export type IconButtonIconProps = {
  render: NonNullable<RoleProps<"svg">["render"]>;
};

function IconButtonRoot({ size = "medium", style, ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      size={size}
      variant="ghost"
      style={[styles.root, iconSizeStyles[size], style]}
    />
  );
}

function IconButtonIcon({ render }: IconButtonIconProps) {
  return (
    <Role.svg
      render={render}
      aria-hidden="true"
      color="currentColor"
      focusable="false"
      strokeWidth={1.5}
      {...stylex.props(styles.icon)}
    />
  );
}

export const IconButton = {
  Root: IconButtonRoot,
  Icon: IconButtonIcon,
} as const;

const styles = stylex.create({
  root: {
    aspectRatio: "1",
    paddingInline: 0,
  },
  icon: {
    display: "block",
    flexShrink: 0,
    height: "1em",
    width: "1em",
  },
  medium: { fontSize: tokens.controlIconSize },
  small: { fontSize: tokens.controlIconSizeSmall },
});

const iconSizeStyles = {
  medium: styles.medium,
  small: styles.small,
} satisfies Record<IconButtonSize, StyleXStyles>;
