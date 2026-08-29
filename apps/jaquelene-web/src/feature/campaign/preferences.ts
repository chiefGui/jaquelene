import { CampaignPreferences, type ModelSelection } from "@jaquelene/ipc/renderer";
import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getDefaultCampaignModel = requireIpcMethod(CampaignPreferences?.getDefaultModel);
const setDefaultCampaignModel = requireIpcMethod(CampaignPreferences?.setDefaultModel);
const setDefaultCampaignModelMutationKey = [
  "preferences",
  "campaign",
  "set-default-model",
] as const;

type SetDefaultCampaignModelContext = {
  previousDefaultModel: ModelSelection | null | undefined;
};

export const defaultCampaignModelQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "campaign", "default-model"],
  queryFn: getDefaultCampaignModel,
});

export function setDefaultCampaignModelMutationOptions(queryClient: QueryClient) {
  return mutationOptions<ModelSelection, Error, ModelSelection, SetDefaultCampaignModelContext>({
    ...ipcMutationOptions,
    mutationKey: setDefaultCampaignModelMutationKey,
    scope: { id: "default-campaign-model" },
    mutationFn: setDefaultCampaignModel,
    async onMutate(selection) {
      await queryClient.cancelQueries({
        queryKey: defaultCampaignModelQuery.queryKey,
        exact: true,
      });
      const previousDefaultModel = queryClient.getQueryData<ModelSelection | null>(
        defaultCampaignModelQuery.queryKey,
      );

      queryClient.setQueryData<ModelSelection>(defaultCampaignModelQuery.queryKey, {
        ...selection,
      });

      return { previousDefaultModel };
    },
    onError(_error, _selection, context) {
      if (!context) {
        return;
      }

      if (context.previousDefaultModel === undefined) {
        queryClient.removeQueries({
          queryKey: defaultCampaignModelQuery.queryKey,
          exact: true,
        });
        return;
      }

      queryClient.setQueryData(defaultCampaignModelQuery.queryKey, context.previousDefaultModel);
    },
    onSuccess(defaultModel) {
      queryClient.setQueryData(defaultCampaignModelQuery.queryKey, defaultModel);
    },
  });
}

export function useSetDefaultCampaignModel() {
  const queryClient = useQueryClient();
  return useMutation(setDefaultCampaignModelMutationOptions(queryClient));
}
