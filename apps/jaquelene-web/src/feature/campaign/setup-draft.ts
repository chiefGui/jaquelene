import type { CampaignSetupInput } from "@jaquelene/domain";
import { skipToken, type QueryClient } from "@tanstack/react-query";
import { campaignQueryKey } from "@/feature/cache-keys";

type CampaignSetupScenario =
  | Readonly<{ mode: "default" }>
  | Readonly<{ mode: "custom"; text: string }>;

export type CampaignSetupDraft = Readonly<{
  title: string;
  openingScene: string;
  scenario: CampaignSetupScenario;
  narratorPromptKey?: string;
}>;

const draftQueryKey = [...campaignQueryKey, "setup-draft"] as const;
const emptyDraft: CampaignSetupDraft = {
  title: "",
  openingScene: "",
  scenario: { mode: "default" },
};

export function resolveCampaignSetupValues(
  draft: CampaignSetupDraft,
  defaultScenario: string,
): CampaignSetupInput {
  let scenario = defaultScenario;
  if (draft.scenario.mode === "custom") scenario = draft.scenario.text;
  return { title: draft.title, scenario, openingScene: draft.openingScene };
}

export function readCampaignSetupDraft(queryClient: QueryClient): CampaignSetupDraft {
  return queryClient.getQueryData<CampaignSetupDraft>(draftQueryKey) ?? emptyDraft;
}

function sameScenario(left: CampaignSetupScenario, right: CampaignSetupScenario) {
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
    previous.openingScene === next.openingScene &&
    sameScenario(previous.scenario, next.scenario) &&
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
