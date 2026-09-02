import {
  type CampaignGenerationPreferences,
  Campaigns,
  type Campaign,
} from "@jaquelene/ipc/renderer";
import {
  mutationOptions,
  queryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const startCampaign = requireIpcMethod(Campaigns?.start);
const listCampaignsForScenario = requireIpcMethod(Campaigns?.listForScenario);
const getCampaign = requireIpcMethod(Campaigns?.get);
const setCampaignGenerationPreferences = requireIpcMethod(Campaigns?.setGenerationPreferences);
export const campaignQueryKey = ["campaigns"] as const;

function setCampaignGenerationPreferencesMutationKey(id: string) {
  return [...campaignQueryKey, id, "set-generation-preferences"] as const;
}

type SetCampaignGenerationPreferencesContext = {
  sequence: PreferencesMutationSequence;
  version: number;
};

type PreferencesMutationSequence = {
  confirmedCampaign: Campaign | null | undefined;
  initialized: boolean;
  latestVersion: number;
  pending: number;
};

const preferencesMutationSequences = new WeakMap<
  QueryClient,
  Map<string, PreferencesMutationSequence>
>();

export function campaignsForScenarioQuery(scenarioId: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignQueryKey, { scenarioId }],
    queryFn: () => listCampaignsForScenario(scenarioId),
  });
}

export function campaignQuery(id: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignQueryKey, id],
    queryFn: () => getCampaign(id),
  });
}

function withoutGenerationPreferences(campaign: Campaign): Campaign {
  const inheritedCampaign = { ...campaign };
  delete inheritedCampaign.generationPreferences;
  return inheritedCampaign;
}

function cacheCampaign(queryClient: QueryClient, campaign: Campaign) {
  queryClient.setQueryData(campaignQuery(campaign.id).queryKey, campaign);
  queryClient.setQueryData<Campaign[]>(
    campaignsForScenarioQuery(campaign.scenarioId).queryKey,
    (campaigns) =>
      campaigns?.map((candidate) => (candidate.id === campaign.id ? campaign : candidate)),
  );
}

function beginPreferencesMutation(queryClient: QueryClient, id: string) {
  let sequences = preferencesMutationSequences.get(queryClient);

  if (!sequences) {
    sequences = new Map();
    preferencesMutationSequences.set(queryClient, sequences);
  }

  let sequence = sequences.get(id);

  if (!sequence) {
    sequence = {
      confirmedCampaign: undefined,
      initialized: false,
      latestVersion: 0,
      pending: 0,
    };
    sequences.set(id, sequence);
  }

  sequence.latestVersion += 1;
  sequence.pending += 1;
  return { sequence, version: sequence.latestVersion };
}

function endPreferencesMutation(
  queryClient: QueryClient,
  id: string,
  context: SetCampaignGenerationPreferencesContext | undefined,
) {
  if (!context) {
    return;
  }

  context.sequence.pending -= 1;

  if (context.sequence.pending > 0) {
    return;
  }

  const sequences = preferencesMutationSequences.get(queryClient);

  if (sequences?.get(id) === context.sequence) {
    sequences.delete(id);

    if (sequences.size === 0) {
      preferencesMutationSequences.delete(queryClient);
    }
  }
}

export function setCampaignGenerationPreferencesMutationOptions(
  queryClient: QueryClient,
  id: string,
) {
  const query = campaignQuery(id);

  return mutationOptions<
    Campaign,
    Error,
    CampaignGenerationPreferences | null,
    SetCampaignGenerationPreferencesContext
  >({
    ...ipcMutationOptions,
    mutationKey: setCampaignGenerationPreferencesMutationKey(id),
    scope: { id: `campaign:${id}:generation-preferences` },
    async mutationFn(preferences) {
      const campaign = await setCampaignGenerationPreferences(id, preferences);

      if (!campaign) {
        throw new Error(`Campaign "${id}" is unavailable.`);
      }

      return campaign;
    },
    async onMutate(preferences) {
      const context = beginPreferencesMutation(queryClient, id);
      await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
      const previousCampaign = queryClient.getQueryData<Campaign | null>(query.queryKey);

      if (!context.sequence.initialized) {
        context.sequence.confirmedCampaign = previousCampaign;
        context.sequence.initialized = true;
      }

      if (previousCampaign) {
        await queryClient.cancelQueries({
          queryKey: campaignsForScenarioQuery(previousCampaign.scenarioId).queryKey,
          exact: true,
        });
        if (context.version === context.sequence.latestVersion) {
          cacheCampaign(
            queryClient,
            preferences
              ? {
                  ...previousCampaign,
                  generationPreferences: {
                    ...(preferences.model ? { model: { ...preferences.model } } : {}),
                    ...(preferences.reasoningPreset === undefined
                      ? {}
                      : { reasoningPreset: preferences.reasoningPreset }),
                  },
                }
              : withoutGenerationPreferences(previousCampaign),
          );
        }
      }

      return context;
    },
    onError(_error, _preferences, context) {
      if (
        context &&
        context.version === context.sequence.latestVersion &&
        context.sequence.confirmedCampaign
      ) {
        cacheCampaign(queryClient, context.sequence.confirmedCampaign);
      }
    },
    onSuccess(campaign, _preferences, context) {
      context.sequence.confirmedCampaign = campaign;

      if (context.version === context.sequence.latestVersion) {
        cacheCampaign(queryClient, campaign);
      }
    },
    onSettled(_campaign, _error, _preferences, context) {
      endPreferencesMutation(queryClient, id, context);
    },
  });
}

export function useSetCampaignGenerationPreferences(id: string) {
  const queryClient = useQueryClient();
  return useMutation(setCampaignGenerationPreferencesMutationOptions(queryClient, id));
}

export function useIsCampaignGenerationPreferencesPending(id: string) {
  return (
    useIsMutating({
      mutationKey: setCampaignGenerationPreferencesMutationKey(id),
    }) > 0
  );
}

export function useStartCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: startCampaign,
    onSuccess(campaign) {
      queryClient.setQueryData(campaignQuery(campaign.id).queryKey, campaign);
      return queryClient.invalidateQueries({
        queryKey: campaignsForScenarioQuery(campaign.scenarioId).queryKey,
        exact: true,
      });
    },
  });
}
