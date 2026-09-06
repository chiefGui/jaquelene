import type { CampaignSetupInput } from "@jaquelene/domain";
import { skipToken, type QueryClient } from "@tanstack/react-query";
import { campaignQueryKey } from "@/feature/cache-keys";

export type CampaignSetupDraft = Readonly<{
  values: CampaignSetupInput;
  narratorPromptKey?: string;
}>;

const draftQueryKey = [...campaignQueryKey, "setup-draft"] as const;
const emptyDraft: CampaignSetupDraft = { values: { title: "", scenario: "" } };

export function readCampaignSetupDraft(queryClient: QueryClient): CampaignSetupDraft {
  return queryClient.getQueryData<CampaignSetupDraft>(draftQueryKey) ?? emptyDraft;
}

export function writeCampaignSetupDraft(
  queryClient: QueryClient,
  patch: Partial<CampaignSetupDraft>,
) {
  const previous = readCampaignSetupDraft(queryClient);
  const next = { ...previous, ...patch };
  if (
    previous.values.title === next.values.title &&
    previous.values.scenario === next.values.scenario &&
    previous.narratorPromptKey === next.narratorPromptKey
  ) {
    return previous;
  }
  const query = queryClient.getQueryCache().build<CampaignSetupDraft>(queryClient, {
    queryKey: draftQueryKey,
    queryFn: skipToken,
    gcTime: Infinity,
    structuralSharing: false,
  });
  return query.setData(next, { manual: true });
}

export function subscribeToCampaignSetupDraft(queryClient: QueryClient, onChange: () => void) {
  return queryClient.getQueryCache().subscribe(({ query }) => {
    const key = query.queryKey;
    if (
      key.length === draftQueryKey.length &&
      draftQueryKey.every((part, index) => key[index] === part)
    ) {
      onChange();
    }
  });
}

export function clearSubmittedCampaignSetupDraft(
  queryClient: QueryClient,
  submitted: CampaignSetupDraft,
) {
  // A completed request must not erase a newer draft entered after navigation.
  if (readCampaignSetupDraft(queryClient) === submitted) {
    queryClient.removeQueries({ queryKey: draftQueryKey, exact: true });
  }
}
