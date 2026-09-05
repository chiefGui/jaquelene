import { narratorPromptKindKey } from "@jaquelene/domain";
import { Item } from "@jaquelene/ui";
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

export function CampaignNarratorControl({ campaignId }: { campaignId: string }) {
  const { data: selection } = useSuspenseQuery(
    campaignPromptSelectionQuery(campaignId, narratorPromptKindKey),
  );

  if (!selection) {
    throw new Error(`Campaign "${campaignId}" is unavailable.`);
  }

  if (!selection.effectivePromptKey) {
    throw new Error(`Campaign "${campaignId}" has no available narrator prompt.`);
  }

  return (
    <NarratorSelectionControl
      campaignId={campaignId}
      effectivePromptKey={selection.effectivePromptKey}
    />
  );
}

function NarratorSelectionControl({
  campaignId,
  effectivePromptKey,
}: {
  campaignId: string;
  effectivePromptKey: string;
}) {
  const promptPages = useSuspenseInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const { data: effectivePrompt } = useSuspenseQuery(promptQuery(effectivePromptKey));
  const setSelection = useSetCampaignPromptSelection(campaignId, narratorPromptKindKey);
  const defaultPending = useIsPromptDefaultPending(narratorPromptKindKey);
  const controlId = useId();
  const labelId = useId();
  const errorId = useId();

  if (!effectivePrompt) {
    throw new Error(`Campaign "${campaignId}" has no available narrator prompt.`);
  }

  const prompts = promptPages.data.pages.flatMap((page) => page.prompts);
  let availablePrompts = prompts;
  if (!prompts.some(({ key }) => key === effectivePrompt.key)) {
    availablePrompts = [effectivePrompt, ...prompts];
  }
  const options = availablePrompts.map(
    (prompt) =>
      ({
        description: prompt.body,
        title: prompt.title,
        value: prompt.key,
      }) satisfies PromptSelectOption,
  );

  return (
    <Item.Root inset="none" style={styles.root}>
      <Item.Content>
        <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
          Narrator
        </Item.Label>
        {setSelection.isError && (
          <Item.Description id={errorId} role="alert" style={styles.error}>
            Couldn't save the narrator.
          </Item.Description>
        )}
      </Item.Content>

      <PromptSelect
        id={controlId}
        aria-labelledby={labelId}
        {...(setSelection.isError && { "aria-describedby": errorId })}
        busy={setSelection.isPending || defaultPending}
        footerAction={{
          label: "Manage narrator",
          render: <Link to="/library/narrator" preload="render" />,
        }}
        hasMore={promptPages.hasNextPage}
        loadingMore={promptPages.isFetchingNextPage}
        onLoadMore={() => void promptPages.fetchNextPage()}
        value={effectivePromptKey}
        options={options}
        onValueChange={(promptKey) => {
          setSelection.reset();
          let selectedPromptKey: string | undefined = promptKey;
          if (promptKey === defaultSelection.promptKey) selectedPromptKey = undefined;
          setSelection.mutate(selectedPromptKey, {
            onError(cause) {
              reportError("campaign.narrator.update", cause);
            },
          });
        }}
      />
    </Item.Root>
  );
}

const styles = stylex.create({
  root: {
    flexWrap: "wrap",
    gap: "0.75rem 1rem",
    minHeight: 0,
  },
  error: { color: colors.foregroundDanger },
});
