import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Button, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";

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

export function PromptLibraryPagination({
  query,
  label,
}: {
  query: Pick<
    UseInfiniteQueryResult,
    "hasNextPage" | "isFetchingNextPage" | "isFetchNextPageError" | "fetchNextPage"
  >;
  label: string;
}) {
  if (!query.hasNextPage && !query.isFetchNextPageError) return null;
  let action = "Load more";
  if (query.isFetchNextPageError) action = "Try again";
  if (query.isFetchingNextPage) action = "Loading\u2026";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
        style={styles.loadMore}
      >
        {action}
      </Button>
      {query.isFetchNextPageError && (
        <p role="alert" {...stylex.props(styles.error)}>
          Couldn't load more {label}. Try again.
        </p>
      )}
    </>
  );
}

export const promptLibraryStyles = stylex.create({
  sectionDescription: { maxWidth: "none" },
});

const styles = stylex.create({
  loadMore: { marginBlockStart: "0.75rem" },
  error: { color: colors.foregroundDanger, fontSize: tokens.fontSizeSmall },
  row: {
    backgroundColor: "transparent",
    borderColor: colors.borderDefault,
    borderStyle: "dashed",
    borderWidth: 1,
    minHeight: 0,
  },
  create: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": colors.backgroundNeutralSubtlest,
    },
    gap: "0.5rem",
    height: "3rem",
    justifyContent: "flex-start",
    outlineOffset: -3,
    paddingInline: "1rem",
    textAlign: "start",
    width: "100%",
  },
});
