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
  previousCampaign: Campaign | null | undefined;
};

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
      await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
      const previousCampaign = queryClient.getQueryData<Campaign | null>(query.queryKey);

      if (previousCampaign) {
        await queryClient.cancelQueries({
          queryKey: campaignsForScenarioQuery(previousCampaign.scenarioId).queryKey,
          exact: true,
        });
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

      return { previousCampaign };
    },
    onError(_error, _configuration, context) {
      if (context?.previousCampaign) {
        cacheCampaign(queryClient, context.previousCampaign);
      }
    },
    onSuccess(campaign) {
      cacheCampaign(queryClient, campaign);
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
