import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { control } from "./control.stylex";
import { textControl } from "./text-control.stylex";

type InputVariant = "filled" | "ghost";

export type InputProps = Omit<RoleProps<"input">, "className" | "render" | "style"> & {
  style?: StyleXStyles;
  variant?: InputVariant;
};

export function Input({ style, variant = "filled", ...props }: InputProps) {
  return (
    <Role.input
      {...props}
      {...stylex.props(control.root, textControl.root, variantStyles[variant], style)}
    />
  );
}

const variantStyles = {
  filled: control.filled,
  ghost: textControl.ghost,
} satisfies Record<InputVariant, StyleXStyles>;
