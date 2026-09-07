import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { colors } from "@jaquelene/ui/tokens.stylex";
import { Button, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";

export function PromptLibraryCreateItem({
  children,
  render,
}: {
  children: ReactNode;
  render: ReactElement;
}) {
  return (
    <Item.Root render={<li />} inset="none" style={styles.row}>
      <Button variant="ghost" style={styles.create} render={render}>
        <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
        <Button.Label>{children}</Button.Label>
      </Button>
    </Item.Root>
  );
}

export const promptLibraryStyles = stylex.create({
  sectionDescription: { maxWidth: "none" },
});

const styles = stylex.create({
  row: {
    backgroundColor: "transparent",
    borderColor: colors.borderDefault,
    borderStyle: "dashed",
    minHeight: 0,
  },
  create: {
    backgroundColor: "transparent",
    gap: "0.5rem",
    height: "3rem",
    justifyContent: "flex-start",
    outlineOffset: -3,
    paddingInline: "1rem",
    textAlign: "start",
    width: "100%",
  },
});
