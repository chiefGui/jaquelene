import { scenarioPromptKindKey } from "@jaquelene/domain";
import type { Prompt } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { MenuItem } from "@ariakit/react/menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { ScenarioIcon } from "@/primitive/icons";
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

export function ScenarioImportControl() {
  const { disabled, readOnly } = useMarkdownEditorConfiguration("ScenarioImport");
  const { value, setValue } = useMarkdownEditorDocument("ScenarioImport");
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState<Prompt | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const unavailable = disabled || readOnly;
  const pages = useInfiniteQuery({ ...promptPagesQuery(scenarioPromptKindKey), enabled: open });
  const scenarios = pages.data?.pages.flatMap((page) => page.prompts) ?? [];
  let loadMoreLabel = "Load more";
  if (pages.isFetchingNextPage) {
    loadMoreLabel = "Loading…";
  }

  function select(scenario: Prompt) {
    if (unavailable) {
      return;
    }
    if (value.trim()) {
      setReplacement(scenario);
      return;
    }
    setValue(scenario.body);
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
                  <IconButton.Root aria-label="Use scenario" size="small" shape="squircle">
                    <IconButton.Icon render={<HugeiconsIcon icon={ScenarioIcon} />} />
                  </IconButton.Root>
                }
              />
            }
          />
          <Tooltip>Use scenario</Tooltip>
        </Tooltip.Root>
        <Menu.Content
          aria-label="Scenarios"
          autoFocusOnHide={replacement === null}
          style={styles.menu}
        >
          {pages.isPending && (
            <p role="status" {...stylex.props(styles.status)}>
              Loading scenarios…
            </p>
          )}
          {scenarios.map((scenario) => (
            <Menu.Item
              key={scenario.key}
              aria-label={scenario.title}
              onClick={() => select(scenario)}
            >
              <PromptChoiceText title={scenario.title} description={scenario.body} />
            </Menu.Item>
          ))}
          {!pages.isPending && !pages.isError && scenarios.length === 0 && (
            <p role="status" {...stylex.props(styles.status)}>
              No scenarios yet.
            </p>
          )}
          {pages.isError && (
            <>
              <p role="alert" {...stylex.props(styles.status)}>
                Couldn't load scenarios.
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
              render={<MenuItem render={<Link to="/library/scenarios" />} />}
            >
              Manage scenarios
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
        heading="Replace scenario?"
        description="Your current text will be replaced with the selected scenario."
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
