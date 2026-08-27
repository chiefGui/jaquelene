import { OpenRouterConfiguration } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getOpenRouterStatus = requireIpcMethod(OpenRouterConfiguration?.getStatus);
const configureOpenRouter = requireIpcMethod(OpenRouterConfiguration?.configure);
const clearOpenRouter = requireIpcMethod(OpenRouterConfiguration?.clear);

export const openRouterStatusQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["openrouter", "status"],
  queryFn: getOpenRouterStatus,
});

export function useConfigureOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: configureOpenRouter,
    onSuccess(status) {
      queryClient.setQueryData(openRouterStatusQuery.queryKey, status);
    },
  });
}

export function useClearOpenRouter() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: clearOpenRouter,
    onSuccess(status) {
      queryClient.setQueryData(openRouterStatusQuery.queryKey, status);
    },
  });
}
