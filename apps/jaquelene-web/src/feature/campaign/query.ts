import {
  Campaigns,
  type Campaign,
  type GenerationConfigurationSelection,
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
const setCampaignGenerationConfigurationOverride = requireIpcMethod(
  Campaigns?.setGenerationConfigurationOverride,
);
export const campaignQueryKey = ["campaigns"] as const;

function setCampaignGenerationConfigurationOverrideMutationKey(id: string) {
  return [...campaignQueryKey, id, "set-generation-configuration-override"] as const;
}

type SetCampaignGenerationConfigurationOverrideContext = {
  sequence: ConfigurationMutationSequence;
  version: number;
};

type ConfigurationMutationSequence = {
  confirmedCampaign: Campaign | null | undefined;
  initialized: boolean;
  latestVersion: number;
  pending: number;
};

const configurationMutationSequences = new WeakMap<
  QueryClient,
  Map<string, ConfigurationMutationSequence>
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

function withoutGenerationConfigurationOverride(campaign: Campaign): Campaign {
  const inheritedCampaign = { ...campaign };
  delete inheritedCampaign.generationConfigurationOverride;
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

function beginConfigurationMutation(queryClient: QueryClient, id: string) {
  let sequences = configurationMutationSequences.get(queryClient);

  if (!sequences) {
    sequences = new Map();
    configurationMutationSequences.set(queryClient, sequences);
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

function endConfigurationMutation(
  queryClient: QueryClient,
  id: string,
  context: SetCampaignGenerationConfigurationOverrideContext | undefined,
) {
  if (!context) {
    return;
  }

  context.sequence.pending -= 1;

  if (context.sequence.pending > 0) {
    return;
  }

  const sequences = configurationMutationSequences.get(queryClient);

  if (sequences?.get(id) === context.sequence) {
    sequences.delete(id);

    if (sequences.size === 0) {
      configurationMutationSequences.delete(queryClient);
    }
  }
}

export function setCampaignGenerationConfigurationOverrideMutationOptions(
  queryClient: QueryClient,
  id: string,
) {
  const query = campaignQuery(id);

  return mutationOptions<
    Campaign,
    Error,
    GenerationConfigurationSelection | null,
    SetCampaignGenerationConfigurationOverrideContext
  >({
    ...ipcMutationOptions,
    mutationKey: setCampaignGenerationConfigurationOverrideMutationKey(id),
    scope: { id: `campaign:${id}:generation-configuration-override` },
    async mutationFn(configuration) {
      const campaign = await setCampaignGenerationConfigurationOverride(id, configuration);

      if (!campaign) {
        throw new Error(`Campaign "${id}" is unavailable.`);
      }

      return campaign;
    },
    async onMutate(configuration) {
      const context = beginConfigurationMutation(queryClient, id);
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
            configuration
              ? {
                  ...previousCampaign,
                  generationConfigurationOverride: {
                    model: { ...configuration.model },
                    ...(configuration.reasoningPresetOverride === undefined
                      ? {}
                      : { reasoningPresetOverride: configuration.reasoningPresetOverride }),
                  },
                }
              : withoutGenerationConfigurationOverride(previousCampaign),
          );
        }
      }

      return context;
    },
    onError(_error, _configuration, context) {
      if (
        context &&
        context.version === context.sequence.latestVersion &&
        context.sequence.confirmedCampaign
      ) {
        cacheCampaign(queryClient, context.sequence.confirmedCampaign);
      }
    },
    onSuccess(campaign, _configuration, context) {
      context.sequence.confirmedCampaign = campaign;

      if (context.version === context.sequence.latestVersion) {
        cacheCampaign(queryClient, campaign);
      }
    },
    onSettled(_campaign, _error, _configuration, context) {
      endConfigurationMutation(queryClient, id, context);
    },
  });
}

export function useSetCampaignGenerationConfigurationOverride(id: string) {
  const queryClient = useQueryClient();
  return useMutation(setCampaignGenerationConfigurationOverrideMutationOptions(queryClient, id));
}

export function useIsCampaignGenerationConfigurationOverridePending(id: string) {
  return (
    useIsMutating({
      mutationKey: setCampaignGenerationConfigurationOverrideMutationKey(id),
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
