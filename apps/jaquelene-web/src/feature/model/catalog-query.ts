import { ModelCatalog } from "@jaquelene/ipc/renderer";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listModelProviders = requireIpcMethod(ModelCatalog?.listProviders);
const listModels = requireIpcMethod(ModelCatalog?.listModels);
const modelCatalogKey = ["model-catalog"] as const;
const modelCatalogCache = {
  gcTime: 30 * 60_000,
  staleTime: 15 * 60_000,
} as const;

export const modelProvidersQuery = queryOptions({
  ...ipcQueryOptions,
  ...modelCatalogCache,
  queryKey: [...modelCatalogKey, "providers"],
  queryFn: listModelProviders,
});

export function modelsForProviderQuery(providerId: string) {
  return queryOptions({
    ...ipcQueryOptions,
    ...modelCatalogCache,
    queryKey: [...modelCatalogKey, "models", providerId],
    queryFn: () => listModels(providerId),
  });
}

export function resetModelProvider(queryClient: QueryClient, providerId: string) {
  return Promise.all([
    queryClient.resetQueries({ queryKey: modelProvidersQuery.queryKey, exact: true }),
    queryClient.resetQueries({
      queryKey: modelsForProviderQuery(providerId).queryKey,
      exact: true,
    }),
  ]);
}

export function resetModelCatalog(queryClient: QueryClient) {
  return queryClient.resetQueries({ queryKey: modelCatalogKey });
}
