import {
  ModelPreferences,
  type ModelPreferenceValues,
  type ModelReference,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getPreferences = requireIpcMethod(ModelPreferences?.get);
const setDefault = requireIpcMethod(ModelPreferences?.setDefault);
const setDefaultModelMutationKey = ["preferences", "model", "set-default"] as const;

export const modelPreferencesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "model"],
  queryFn: getPreferences,
});

export function useSetDefaultModel() {
  const queryClient = useQueryClient();

  return useMutation<ModelPreferenceValues, Error, ModelReference>({
    ...ipcMutationOptions,
    mutationKey: setDefaultModelMutationKey,
    scope: { id: "default-model" },
    mutationFn: setDefault,
    onMutate(reference) {
      const cancellation = queryClient.cancelQueries({
        queryKey: modelPreferencesQuery.queryKey,
        exact: true,
      });

      queryClient.setQueryData<ModelPreferenceValues>(modelPreferencesQuery.queryKey, (values) =>
        values ? { ...values, default: { ...reference } } : values,
      );

      return cancellation;
    },
    onSettled(_values, error) {
      if (
        error &&
        queryClient.isMutating({ mutationKey: setDefaultModelMutationKey, exact: true }) === 1
      ) {
        return queryClient.invalidateQueries({
          queryKey: modelPreferencesQuery.queryKey,
          exact: true,
        });
      }
    },
  });
}
