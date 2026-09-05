import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { control } from "./control.stylex";

type InputVariant = "filled" | "ghost";

export type InputProps = Omit<RoleProps<"input">, "className" | "render" | "style"> & {
  style?: StyleXStyles;
  variant?: InputVariant;
};

export function Input({ style, variant = "filled", ...props }: InputProps) {
  return (
    <Role.input
      {...props}
      {...stylex.props(control.root, styles.root, variantStyles[variant], style)}
    />
  );
}

const styles = stylex.create({
  root: {
    appearance: "none",
    caretColor: colors.foregroundAccent,
    "::placeholder": {
      color: colors.foregroundSecondary,
    },
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
});

const variantStyles = {
  filled: control.filled,
  ghost: styles.ghost,
} satisfies Record<InputVariant, StyleXStyles>;
