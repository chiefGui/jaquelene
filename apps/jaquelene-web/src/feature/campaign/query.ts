import { Campaigns } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const startCampaign = requireIpcMethod(Campaigns?.start);
const listCampaignsForScenario = requireIpcMethod(Campaigns?.listForScenario);
const getCampaign = requireIpcMethod(Campaigns?.get);
export const campaignQueryKey = ["campaigns"] as const;

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
