import {
  ModelPreferences,
  type ModelPreferenceValues,
  type ModelReference,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getPreferences = requireIpcMethod(ModelPreferences?.get);
const setDefault = requireIpcMethod(ModelPreferences?.setDefault);

export const modelPreferencesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "model"],
  queryFn: getPreferences,
});

export function useSetDefaultModel() {
  const queryClient = useQueryClient();

  return useMutation<ModelPreferenceValues, Error, ModelReference>({
    ...ipcMutationOptions,
    mutationFn: setDefault,
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: modelPreferencesQuery.queryKey, exact: true }),
    onSuccess(values) {
      queryClient.setQueryData(modelPreferencesQuery.queryKey, values);
    },
  });
}
