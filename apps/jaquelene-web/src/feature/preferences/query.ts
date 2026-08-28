import { Preferences, type ModelReference } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

export type { ModelReference };

const getDefaultModel = requireIpcMethod(Preferences?.getDefaultModel);
const setDefaultModel = requireIpcMethod(Preferences?.setDefaultModel);

export const defaultModelQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "default-model"],
  queryFn: getDefaultModel,
});

export function useSetDefaultModel() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: (reference: ModelReference) => setDefaultModel(reference),
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: defaultModelQuery.queryKey, exact: true }),
    onSuccess(defaultModel) {
      queryClient.setQueryData(defaultModelQuery.queryKey, defaultModel);
    },
  });
}
