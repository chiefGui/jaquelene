import { CampaignPreferences, type ModelReference } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getDefaultCampaignModel = requireIpcMethod(CampaignPreferences?.getDefaultModel);
const setDefaultCampaignModel = requireIpcMethod(CampaignPreferences?.setDefaultModel);
const setDefaultCampaignModelMutationKey = [
  "preferences",
  "campaign",
  "set-default-model",
] as const;

export const defaultCampaignModelQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "campaign", "default-model"],
  queryFn: getDefaultCampaignModel,
});

export function useSetDefaultCampaignModel() {
  const queryClient = useQueryClient();

  return useMutation<ModelReference, Error, ModelReference>({
    ...ipcMutationOptions,
    mutationKey: setDefaultCampaignModelMutationKey,
    scope: { id: "default-campaign-model" },
    mutationFn: setDefaultCampaignModel,
    onMutate(reference) {
      const cancellation = queryClient.cancelQueries({
        queryKey: defaultCampaignModelQuery.queryKey,
        exact: true,
      });

      queryClient.setQueryData(defaultCampaignModelQuery.queryKey, { ...reference });

      return cancellation;
    },
    onSettled(defaultModel) {
      if (
        queryClient.isMutating({
          mutationKey: setDefaultCampaignModelMutationKey,
          exact: true,
        }) === 1
      ) {
        if (defaultModel !== undefined) {
          queryClient.setQueryData(defaultCampaignModelQuery.queryKey, defaultModel);
          return;
        }

        return queryClient.invalidateQueries({
          queryKey: defaultCampaignModelQuery.queryKey,
          exact: true,
        });
      }
    },
  });
}
