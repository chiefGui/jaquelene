import {
  OpenRouterConnection,
  OpenRouterConnectionState,
  OpenRouterConfigurationState,
  type OpenRouterConfiguration,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { resetModelProvider } from "@/feature/model/catalog-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

export const openRouterProvider = {
  brandId: "openrouter",
  id: "openrouter",
} as const;

const getOpenRouterConfiguration = requireIpcMethod(OpenRouterConnection?.getConfiguration);
const connectOpenRouter = requireIpcMethod(OpenRouterConnection?.connect);
const disconnectOpenRouter = requireIpcMethod(OpenRouterConnection?.disconnect);

export const openRouterConfigurationQuery = queryOptions({
  ...ipcQueryOptions,
  staleTime: "static",
  queryKey: [openRouterProvider.id, "configuration"],
  queryFn: getOpenRouterConfiguration,
});

export function useConnectOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: connectOpenRouter,
    onSuccess(status) {
      if (status.state === OpenRouterConnectionState.Connected) {
        queryClient.setQueryData<OpenRouterConfiguration>(openRouterConfigurationQuery.queryKey, {
          state: OpenRouterConfigurationState.Configured,
          ...(status.keyLabel ? { keyLabel: status.keyLabel } : {}),
        });
        return resetModelProvider(queryClient, openRouterProvider.id);
      }
    },
  });
}

export function useDisconnectOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: disconnectOpenRouter,
    onSuccess() {
      queryClient.setQueryData<OpenRouterConfiguration>(openRouterConfigurationQuery.queryKey, {
        state: OpenRouterConfigurationState.Disconnected,
      });
      return resetModelProvider(queryClient, openRouterProvider.id);
    },
  });
}
