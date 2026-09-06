import { Button, ControlIcon, type ButtonProps } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

function Root({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.root)}>{children}</div>;
}

function Action({
  children,
  navigation = false,
  ...props
}: Omit<ButtonProps, "shape" | "size" | "style" | "variant"> & { navigation?: boolean }) {
  return (
    <Button {...props} variant="ghost" shape="squircle" style={styles.action}>
      <Button.Label>{children}</Button.Label>
      {navigation && <ControlIcon.Chevron style={styles.icon} />}
    </Button>
  );
}

export const PromptPickerFooter = { Root, Action } as const;

const styles = stylex.create({
  root: {
    borderBlockStartColor: colors.borderOverlay,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "grid",
    flexShrink: 0,
    gap: "0.25rem",
    marginInline: "-0.25rem",
    paddingBlockStart: "0.25rem",
    paddingInline: "0.25rem",
  },
  action: {
    justifyContent: "space-between",
    width: "100%",
  },
  icon: { height: "0.75rem", width: "0.75rem" },
});
