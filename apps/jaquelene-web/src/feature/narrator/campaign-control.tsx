import { Field } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { PromptSelect, type PromptSelectOption } from "@/feature/prompt/select";
import {
  campaignPromptSelectionQuery,
  promptDefaultQuery,
  promptPagesQuery,
  promptQuery,
  useIsPromptDefaultPending,
  useSetCampaignPromptSelection,
} from "@/feature/prompt/query";
import { narratorPromptKindKey } from "./kind";

export function CampaignNarratorControl({ campaignId }: { campaignId: string }) {
  const promptPages = useSuspenseInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const { data: selection } = useSuspenseQuery(
    campaignPromptSelectionQuery(campaignId, narratorPromptKindKey),
  );
  const effectivePromptKey = selection?.effectivePromptKey;
  const { data: effectivePrompt } = useSuspenseQuery(
    promptQuery(effectivePromptKey ?? "missing-narrator-prompt"),
  );
  const setSelection = useSetCampaignPromptSelection(campaignId, narratorPromptKindKey);
  const defaultPending = useIsPromptDefaultPending(narratorPromptKindKey);
  const controlId = useId();
  const labelId = useId();
  const errorId = useId();

  if (!selection) {
    throw new Error(`Campaign "${campaignId}" is unavailable.`);
  }

  if (!effectivePromptKey || !effectivePrompt) {
    throw new Error(`Campaign "${campaignId}" has no available narrator prompt.`);
  }

  const prompts = promptPages.data.pages.flatMap((page) => page.prompts);
  const availablePrompts = prompts.some(({ key }) => key === effectivePrompt.key)
    ? prompts
    : [effectivePrompt, ...prompts];
  const options = availablePrompts.map(
    (prompt) =>
      ({
        description: prompt.body,
        title: prompt.title,
        value: prompt.key,
      }) satisfies PromptSelectOption,
  );

  return (
    <Field.Root style={styles.root}>
      <Field.Label id={labelId} htmlFor={controlId} style={styles.label}>
        Narrator
      </Field.Label>

      <PromptSelect
        id={controlId}
        aria-labelledby={labelId}
        {...(setSelection.isError ? { "aria-describedby": errorId } : {})}
        busy={setSelection.isPending || defaultPending}
        footerAction={{
          label: "Manage prompts",
          render: <Link to="/library/narrator" preload="render" />,
        }}
        hasMore={promptPages.hasNextPage}
        loadingMore={promptPages.isFetchingNextPage}
        onLoadMore={() => void promptPages.fetchNextPage()}
        value={effectivePromptKey}
        options={options}
        onValueChange={(promptKey) => {
          setSelection.reset();
          setSelection.mutate(promptKey === defaultSelection.promptKey ? undefined : promptKey, {
            onError(cause) {
              reportError("campaign.narrator.update", cause);
            },
          });
        }}
      />

      {setSelection.isError ? (
        <Field.Error id={errorId} role="alert" style={styles.error}>
          Couldn't save the narrator.
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "grid",
    gap: "0.5rem 0.75rem",
    gridTemplateColumns: "auto minmax(0, 1fr)",
  },
  label: {
    color: colors.foregroundSecondary,
    fontWeight: 400,
    whiteSpace: "nowrap",
  },
  error: { gridColumn: "1 / -1" },
});
