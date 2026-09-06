import { narratorPromptKindKey } from "@jaquelene/domain";
import {
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import type { PromptSelectOption } from "@/feature/prompt/select";
import { NarratorSelectControl } from "./select-control";
import {
  campaignPromptSelectionQuery,
  promptDefaultQuery,
  promptPagesQuery,
  promptQuery,
  useIsPromptDefaultPending,
  useSetCampaignPromptSelection,
} from "@/feature/prompt/query";

export function CampaignNarratorControl({ campaignId }: { campaignId: string }) {
  // Start independent queries before the campaign selection suspends this render.
  usePrefetchInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  usePrefetchQuery(promptDefaultQuery(narratorPromptKindKey));
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
  const { data: effectivePrompt } = useSuspenseQuery(promptQuery(effectivePromptKey));
  const promptPages = useSuspenseInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const setSelection = useSetCampaignPromptSelection(campaignId, narratorPromptKindKey);
  const defaultPending = useIsPromptDefaultPending(narratorPromptKindKey);

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
    <NarratorSelectControl
      {...(setSelection.isError && { error: "Couldn't save the narrator." })}
      busy={setSelection.isPending || defaultPending}
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
  );
}
