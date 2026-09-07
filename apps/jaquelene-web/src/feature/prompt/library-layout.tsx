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
    <Item.Root render={<li />} inset="none">
      <Button variant="ghost" style={styles.create} render={render}>
        {children}
      </Button>
    </Item.Root>
  );
}

export const promptLibraryStyles = stylex.create({
  sectionDescription: { maxWidth: "none" },
});

const styles = stylex.create({
  create: { minHeight: "5rem", outlineOffset: -3, width: "100%" },
});
