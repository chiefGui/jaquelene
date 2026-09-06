import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { control } from "./control.stylex";
import { textControl } from "./text-control.stylex";

export type TextareaProps = Omit<RoleProps<"textarea">, "className" | "render" | "style"> & {
  style?: StyleXStyles;
  variant?: "filled" | "ghost";
};

export function Textarea({ style, rows = 5, variant = "filled", ...props }: TextareaProps) {
  return (
    <Role.textarea
      {...props}
      rows={rows}
      {...stylex.props(control.root, textControl.root, variantStyles[variant], styles.root, style)}
    />
  );
}

const variantStyles = {
  filled: control.filled,
  ghost: textControl.ghost,
} satisfies Record<NonNullable<TextareaProps["variant"]>, StyleXStyles>;

const styles = stylex.create({
  root: {
    fontFamily: "inherit",
    height: "auto",
    minHeight: "5rem",
    paddingBlock: "0.625rem",
    resize: "vertical",
    width: "100%",
  },
});
