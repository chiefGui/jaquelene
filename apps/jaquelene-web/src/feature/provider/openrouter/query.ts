import { OpenRouterConnection, OpenRouterConnectionState } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getOpenRouterStatus = requireIpcMethod(OpenRouterConnection?.getStatus);
const connectOpenRouter = requireIpcMethod(OpenRouterConnection?.connect);
const disconnectOpenRouter = requireIpcMethod(OpenRouterConnection?.disconnect);

export const openRouterConnectionQuery = queryOptions({
  ...ipcQueryOptions,
  staleTime: 60_000,
  queryKey: ["openrouter", "status"],
  queryFn: getOpenRouterStatus,
});

export function useConnectOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: connectOpenRouter,
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: openRouterConnectionQuery.queryKey, exact: true }),
    onSuccess(status) {
      if (status.state === OpenRouterConnectionState.Connected) {
        queryClient.setQueryData(openRouterConnectionQuery.queryKey, status);
      }
    },
  });
}

export function useDisconnectOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: disconnectOpenRouter,
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: openRouterConnectionQuery.queryKey, exact: true }),
    onSuccess(status) {
      queryClient.setQueryData(openRouterConnectionQuery.queryKey, status);
    },
  });
}
