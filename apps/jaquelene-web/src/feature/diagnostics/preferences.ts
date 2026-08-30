import { DiagnosticsPreferences, type DiagnosticsPreferenceValues } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportError } from "./diagnostics";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getPreferences = requireIpcMethod(DiagnosticsPreferences?.get);
const setWriteToDisk = requireIpcMethod(DiagnosticsPreferences?.setWriteToDisk);

export const diagnosticsPreferencesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "diagnostics"],
  queryFn: getPreferences,
});

export function useSetDiagnosticsWriteToDisk() {
  const queryClient = useQueryClient();

  return useMutation<
    DiagnosticsPreferenceValues,
    Error,
    boolean,
    DiagnosticsPreferenceValues | undefined
  >({
    ...ipcMutationOptions,
    mutationFn: setWriteToDisk,
    async onMutate(writeToDisk) {
      await queryClient.cancelQueries({
        queryKey: diagnosticsPreferencesQuery.queryKey,
        exact: true,
      });
      const previous = queryClient.getQueryData<DiagnosticsPreferenceValues>(
        diagnosticsPreferencesQuery.queryKey,
      );

      if (previous) {
        queryClient.setQueryData<DiagnosticsPreferenceValues>(
          diagnosticsPreferencesQuery.queryKey,
          { ...previous, writeToDisk },
        );
      }

      return previous;
    },
    onError(error, _writeToDisk, previous) {
      if (previous) {
        queryClient.setQueryData(diagnosticsPreferencesQuery.queryKey, previous);
      } else {
        queryClient.removeQueries({ queryKey: diagnosticsPreferencesQuery.queryKey, exact: true });
      }

      reportError("diagnostics.preferences.write-to-disk", error);
    },
    onSuccess(values) {
      queryClient.setQueryData(diagnosticsPreferencesQuery.queryKey, values);
    },
  });
}
