import { RegenerationPreferences, type ModelSelection } from "@jaquelene/ipc/renderer";
import {
  mutationOptions,
  queryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getDefaultModel = requireIpcMethod(RegenerationPreferences?.getDefaultModel);
const setDefaultModel = requireIpcMethod(RegenerationPreferences?.setDefaultModel);
const mutationKey = ["preferences", "regeneration", "set-default-model"] as const;

export const defaultRegenerationModelQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "regeneration", "default-model"],
  queryFn: getDefaultModel,
});

export function setDefaultRegenerationModelMutationOptions(queryClient: QueryClient) {
  return mutationOptions<
    ModelSelection,
    Error,
    ModelSelection,
    {
      previousModel: ModelSelection | null | undefined;
    }
  >({
    ...ipcMutationOptions,
    mutationKey,
    scope: { id: "default-regeneration-model" },
    mutationFn: (selection) => setDefaultModel(selection),
    async onMutate(selection) {
      await queryClient.cancelQueries({
        queryKey: defaultRegenerationModelQuery.queryKey,
        exact: true,
      });
      const previousModel = queryClient.getQueryData<ModelSelection | null>(
        defaultRegenerationModelQuery.queryKey,
      );
      queryClient.setQueryData(defaultRegenerationModelQuery.queryKey, { ...selection });
      return { previousModel };
    },
    onError(_error, _selection, context) {
      if (!context) {
        return;
      }
      if (context.previousModel === undefined) {
        queryClient.removeQueries({
          queryKey: defaultRegenerationModelQuery.queryKey,
          exact: true,
        });
        return;
      }
      queryClient.setQueryData(defaultRegenerationModelQuery.queryKey, context.previousModel);
    },
    onSuccess(model) {
      queryClient.setQueryData(defaultRegenerationModelQuery.queryKey, model);
    },
  });
}

export function useSetDefaultRegenerationModel() {
  return useMutation(setDefaultRegenerationModelMutationOptions(useQueryClient()));
}

export function useIsDefaultRegenerationModelPending() {
  return useIsMutating({ mutationKey }) > 0;
}
