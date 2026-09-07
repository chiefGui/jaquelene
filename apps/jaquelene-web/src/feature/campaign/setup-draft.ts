import type { CampaignSetupInput } from "@jaquelene/domain";
import { skipToken, type QueryClient } from "@tanstack/react-query";
import { campaignQueryKey } from "@/feature/cache-keys";

type CampaignSetupText = Readonly<{ mode: "default" }> | Readonly<{ mode: "custom"; text: string }>;

export type CampaignSetupDraft = Readonly<{
  title: string;
  openingScene: CampaignSetupText;
  scenario: CampaignSetupText;
  narratorPromptKey?: string;
}>;

const draftQueryKey = [...campaignQueryKey, "setup-draft"] as const;
const emptyDraft: CampaignSetupDraft = {
  title: "",
  openingScene: { mode: "default" },
  scenario: { mode: "default" },
};

export function resolveCampaignSetupValues(
  draft: CampaignSetupDraft,
  defaults: Pick<CampaignSetupInput, "scenario" | "openingScene">,
): CampaignSetupInput {
  return {
    title: draft.title,
    scenario: resolveText(draft.scenario, defaults.scenario),
    openingScene: resolveText(draft.openingScene, defaults.openingScene),
  };
}

function resolveText(draft: CampaignSetupText, defaultText: string) {
  if (draft.mode === "custom") return draft.text;
  return defaultText;
}

export function readCampaignSetupDraft(queryClient: QueryClient): CampaignSetupDraft {
  return queryClient.getQueryData<CampaignSetupDraft>(draftQueryKey) ?? emptyDraft;
}

function sameText(left: CampaignSetupText, right: CampaignSetupText) {
  if (left.mode === "custom" && right.mode === "custom") return left.text === right.text;
  return left.mode === right.mode;
}

export function writeCampaignSetupDraft(
  queryClient: QueryClient,
  patch: Partial<CampaignSetupDraft>,
) {
  const previous = readCampaignSetupDraft(queryClient);
  const next = { ...previous, ...patch };
  if (
    previous.title === next.title &&
    sameText(previous.openingScene, next.openingScene) &&
    sameText(previous.scenario, next.scenario) &&
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
