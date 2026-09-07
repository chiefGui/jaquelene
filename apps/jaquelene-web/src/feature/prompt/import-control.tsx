import type { Prompt } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { MenuItem } from "@ariakit/react/menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Menu } from "@jaquelene/ui/menu";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  useMarkdownEditorConfiguration,
  useMarkdownEditorDocument,
} from "@/feature/markdown/editor/markdown-editor-root";
import { promptPagesQuery } from "@/feature/prompt/query";
import { PromptChoiceText } from "@/feature/prompt/choice-text";
import { PromptPickerFooter } from "@/feature/prompt/picker-footer";
import type { TextLibrary } from "./text-libraries";

export function PromptImportControl({ library }: { library: TextLibrary }) {
  const { disabled, readOnly } = useMarkdownEditorConfiguration("PromptImport");
  const { value, setValue } = useMarkdownEditorDocument("PromptImport");
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState<Prompt | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const unavailable = disabled || readOnly;
  const pages = useInfiniteQuery({ ...promptPagesQuery(library.kind), enabled: open });
  const entries = pages.data?.pages.flatMap((page) => page.prompts) ?? [];
  let loadMoreLabel = "Load more";
  if (pages.isFetchingNextPage) {
    loadMoreLabel = "Loading…";
  }

  function select(entry: Prompt) {
    if (unavailable) {
      return;
    }
    if (value.trim()) {
      setReplacement(entry);
      return;
    }
    setValue(entry.body);
  }

  return (
    <>
      <Menu.Root open={open} setOpen={setOpen}>
        <Tooltip.Root>
          <Tooltip.Anchor
            render={
              <Menu.Trigger
                ref={trigger}
                disabled={unavailable}
                render={
                  <IconButton.Root aria-label={`Use ${library.noun}`} size="small" shape="squircle">
                    <IconButton.Icon render={<HugeiconsIcon icon={library.icon} />} />
                  </IconButton.Root>
                }
              />
            }
          />
          <Tooltip>{library.plural}</Tooltip>
        </Tooltip.Root>
        <Menu.Content
          aria-label={library.plural}
          autoFocusOnHide={replacement === null}
          style={styles.menu}
        >
          {pages.isPending && (
            <p role="status" {...stylex.props(styles.status)}>
              Loading {library.pluralNoun}…
            </p>
          )}
          {entries.map((entry) => (
            <Menu.Item key={entry.key} aria-label={entry.title} onClick={() => select(entry)}>
              <PromptChoiceText title={entry.title} description={entry.body} />
            </Menu.Item>
          ))}
          {!pages.isPending && !pages.isError && entries.length === 0 && (
            <p role="status" {...stylex.props(styles.status)}>
              No {library.pluralNoun} yet.
            </p>
          )}
          {pages.isError && (
            <>
              <p role="alert" {...stylex.props(styles.status)}>
                Couldn't load {library.pluralNoun}.
              </p>
              <Menu.Item
                hideOnClick={false}
                disabled={pages.isFetching}
                onClick={() => {
                  if (pages.isFetchNextPageError) {
                    void pages.fetchNextPage();
                    return;
                  }
                  void pages.refetch();
                }}
              >
                Try again
              </Menu.Item>
            </>
          )}
          {pages.hasNextPage && !pages.isFetchNextPageError && (
            <Menu.Item
              hideOnClick={false}
              disabled={pages.isFetchingNextPage}
              onClick={() => void pages.fetchNextPage()}
            >
              {loadMoreLabel}
            </Menu.Item>
          )}
          <PromptPickerFooter.Root>
            <PromptPickerFooter.Action
              navigation
              render={<MenuItem render={<Link to={library.indexPath} />} />}
            >
              Manage {library.pluralNoun}
            </PromptPickerFooter.Action>
          </PromptPickerFooter.Root>
        </Menu.Content>
      </Menu.Root>
      <ConfirmDialog
        trigger={null}
        open={replacement !== null}
        setOpen={(nextOpen) => {
          if (!nextOpen) setReplacement(null);
        }}
        finalFocus={trigger}
        heading={`Replace ${library.noun}?`}
        description={`Your current text will be replaced with the selected ${library.noun}.`}
        confirmLabel="Replace"
        pending={unavailable}
        onConfirm={() => {
          if (!replacement || unavailable) {
            return;
          }
          setValue(replacement.body);
          setReplacement(null);
        }}
      />
    </>
  );
}

const styles = stylex.create({
  menu: { width: "20rem" },
  status: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    margin: 0,
    padding: "0.5rem 0.75rem",
  },
});
