import { Campaigns, type Campaign, type ModelSelection } from "@jaquelene/ipc/renderer";
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
const setCampaignModelOverride = requireIpcMethod(Campaigns?.setModelOverride);
export const campaignQueryKey = ["campaigns"] as const;

function setCampaignModelOverrideMutationKey(id: string) {
  return [...campaignQueryKey, id, "set-model-override"] as const;
}

type SetCampaignModelOverrideContext = {
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

function withoutModelOverride(campaign: Campaign): Campaign {
  const inheritedCampaign = { ...campaign };
  delete inheritedCampaign.modelOverride;
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

export function setCampaignModelOverrideMutationOptions(queryClient: QueryClient, id: string) {
  const query = campaignQuery(id);

  return mutationOptions<Campaign, Error, ModelSelection | null, SetCampaignModelOverrideContext>({
    ...ipcMutationOptions,
    mutationKey: setCampaignModelOverrideMutationKey(id),
    scope: { id: `campaign:${id}:model-override` },
    async mutationFn(model) {
      const campaign = await setCampaignModelOverride(id, model);

      if (!campaign) {
        throw new Error(`Campaign "${id}" is unavailable.`);
      }

      return campaign;
    },
    async onMutate(model) {
      await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
      const previousCampaign = queryClient.getQueryData<Campaign | null>(query.queryKey);

      if (previousCampaign) {
        await queryClient.cancelQueries({
          queryKey: campaignsForScenarioQuery(previousCampaign.scenarioId).queryKey,
          exact: true,
        });
        cacheCampaign(
          queryClient,
          model
            ? { ...previousCampaign, modelOverride: { ...model } }
            : withoutModelOverride(previousCampaign),
        );
      }

      return { previousCampaign };
    },
    onError(_error, _model, context) {
      if (context?.previousCampaign) {
        cacheCampaign(queryClient, context.previousCampaign);
      }
    },
    onSuccess(campaign) {
      cacheCampaign(queryClient, campaign);
    },
  });
}

export function useSetCampaignModelOverride(id: string) {
  const queryClient = useQueryClient();
  return useMutation(setCampaignModelOverrideMutationOptions(queryClient, id));
}

export function useIsCampaignModelOverridePending(id: string) {
  return useIsMutating({ mutationKey: setCampaignModelOverrideMutationKey(id) }) > 0;
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
