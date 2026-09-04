import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createContext, useContext, type ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

type IconButtonSize = Exclude<ButtonProps["size"], undefined>;

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "children" | "style" | "variant"> & {
  "aria-label": string;
  children: ReactNode;
  style?: StyleXStyles;
};

export type IconButtonIconProps = {
  render: NonNullable<RoleProps<"svg">["render"]>;
  style?: StyleXStyles;
};

const IconButtonSizeContext = createContext<IconButtonSize | undefined>(undefined);

function IconButtonRoot({ size = "medium", style, ...props }: IconButtonProps) {
  return (
    <IconButtonSizeContext value={size}>
      <Button {...props} size={size} variant="ghost" style={[styles.root, style]} />
    </IconButtonSizeContext>
  );
}

function IconButtonIcon({ style, ...props }: IconButtonIconProps) {
  const size = useContext(IconButtonSizeContext);

  if (!size) {
    throw new Error("IconButton.Icon must be rendered inside IconButton.Root");
  }

  return (
    <Role.svg
      {...props}
      aria-hidden="true"
      color="currentColor"
      focusable="false"
      strokeWidth={1.5}
      {...stylex.props(styles.icon, iconSizeStyles[size], style)}
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
  },
  iconMedium: {
    height: "1rem",
    width: "1rem",
  },
  iconSmall: {
    height: "0.875rem",
    width: "0.875rem",
  },
});

const iconSizeStyles = {
  medium: styles.iconMedium,
  small: styles.iconSmall,
} satisfies Record<IconButtonSize, StyleXStyles>;
