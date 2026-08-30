import { ModelCatalog, StorageCategory } from "@jaquelene/ipc/renderer";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listModelProviders = requireIpcMethod(ModelCatalog?.listProviders);
const getModels = requireIpcMethod(ModelCatalog?.getModels);
const refreshModels = requireIpcMethod(ModelCatalog?.refreshModels);
const modelCatalogKey = ["model-catalog"] as const;
const observedRevisions = new Map<string, number>();
const modelCatalogCache = {
  gcTime: 30 * 60_000,
  staleTime: Infinity,
} as const;

export const modelProvidersQuery = queryOptions({
  ...ipcQueryOptions,
  ...modelCatalogCache,
  queryKey: [...modelCatalogKey, "providers"],
  queryFn: listModelProviders,
});

async function loadModels(providerId: string, force: boolean) {
  let snapshot = await (force ? refreshModels(providerId) : getModels(providerId));
  const observedRevision = observedRevisions.get(providerId) ?? 0;

  if (snapshot.revision < observedRevision) {
    snapshot = await getModels(providerId);
  }

  if (snapshot.revision < observedRevision) {
    throw new Error("The model catalog did not reach its announced revision.");
  }

  observeModelCatalogRevision(providerId, snapshot.revision);
  return snapshot;
}

export function modelsForProviderQuery(providerId: string) {
  return queryOptions({
    ...ipcQueryOptions,
    ...modelCatalogCache,
    meta: { storageCategory: StorageCategory.Cache },
    queryKey: [...modelCatalogKey, "models", providerId],
    queryFn: () => loadModels(providerId, false),
  });
}

export function forceRefreshModels(queryClient: QueryClient, providerId: string) {
  return queryClient.fetchQuery({
    ...modelsForProviderQuery(providerId),
    queryFn: () => loadModels(providerId, true),
    staleTime: 0,
  });
}

export function observeModelCatalogRevision(providerId: string, revision: number) {
  const observed = observedRevisions.get(providerId) ?? 0;

  if (revision > observed) {
    observedRevisions.set(providerId, revision);
  }

  return observed;
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
