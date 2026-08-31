import { ErrorSeverity } from "@jaquelene/diagnostics";
import {
  Storage,
  StorageCategory,
  type StorageDeletion,
  type StorageUsage,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { cacheCampaignContinuation, campaignQueryKey } from "@/feature/campaign/query";
import { defaultCampaignModelQuery } from "@/feature/campaign/preferences";
import { favoriteModelsQuery } from "@/feature/model/favorite-models";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { diagnosticsPreferencesQuery } from "@/feature/diagnostics/preferences";
import { providersQuery } from "@/feature/provider/query";
import { scenarioQueryKey } from "@/feature/scenario/query";
import { threadQueryKey } from "@/feature/thread/query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import { reconcileStorageDeletion, type StorageDeletionTarget } from "./usage";

const measureStorageUsage = requireIpcMethod(Storage?.measureUsage);
const deleteStorageArea = requireIpcMethod(Storage?.deleteArea);
const deleteStorageCategory = requireIpcMethod(Storage?.deleteCategory);

export const storageUsageQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["storage", "usage"],
  queryFn: measureStorageUsage,
  staleTime: "static",
});

export function remeasureStorageUsage(queryClient: QueryClient) {
  return queryClient.fetchQuery({ ...storageUsageQuery, staleTime: 0 });
}

function applyStorageDeletion(
  queryClient: QueryClient,
  deletion: StorageDeletion,
  target: StorageDeletionTarget,
) {
  queryClient.setQueryData<StorageUsage>(storageUsageQuery.queryKey, (usage) => {
    if (!usage) {
      throw new Error("Storage usage is unavailable while applying a deletion.");
    }

    return reconcileStorageDeletion(usage, deletion, target);
  });
}

const contentQueryKeys = [scenarioQueryKey, campaignQueryKey, threadQueryKey] as const;
const appDataQueryKeys = [
  favoriteModelsQuery.queryKey,
  userInterfacePreferencesQuery.queryKey,
  defaultCampaignModelQuery.queryKey,
  diagnosticsPreferencesQuery.queryKey,
  providersQuery.queryKey,
] as const;
const cacheQueryFilter = {
  predicate: (query: { meta?: Record<string, unknown> | undefined }) =>
    query.meta?.storageCategory === StorageCategory.Cache,
} as const;

async function cancelCategoryQueries(queryClient: QueryClient, id: StorageCategory) {
  if (id === StorageCategory.Cache) {
    await queryClient.cancelQueries(cacheQueryFilter);
    return;
  }

  if (id === StorageCategory.Content) {
    await Promise.all(contentQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    return;
  }

  if (id === StorageCategory.AppData) {
    await Promise.all(
      appDataQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey, exact: true })),
    );
  }
}

async function refreshCategoryQueries(
  queryClient: QueryClient,
  id: StorageCategory,
  deletionSucceeded: boolean,
) {
  if (id === StorageCategory.Cache) {
    await queryClient.resetQueries(cacheQueryFilter);
    return;
  }

  if (id === StorageCategory.Content) {
    for (const queryKey of contentQueryKeys) {
      queryClient.removeQueries({ queryKey });
    }

    if (deletionSucceeded) {
      cacheCampaignContinuation(queryClient, null);
    }

    return;
  }

  if (id === StorageCategory.AppData) {
    await Promise.all(
      appDataQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })),
    );
  }
}

export function useDeleteStorageCategory() {
  const queryClient = useQueryClient();

  return useMutation<StorageDeletion, Error, StorageCategory>({
    ...ipcMutationOptions,
    mutationKey: ["storage", "delete-category"],
    scope: { id: "storage" },
    mutationFn: deleteStorageCategory,
    onMutate: (id) => cancelCategoryQueries(queryClient, id),
    onSuccess: (deletion, id) =>
      applyStorageDeletion(queryClient, deletion, { kind: "category", id }),
    onSettled(_usage, error, id) {
      void refreshCategoryQueries(queryClient, id, !error).catch((cause: unknown) => {
        reportError("storage.category.refresh", cause, ErrorSeverity.Warning);
      });
    },
  });
}

export function useDeleteStorageArea() {
  const queryClient = useQueryClient();

  return useMutation<StorageDeletion, Error, string>({
    ...ipcMutationOptions,
    mutationKey: ["storage", "delete-area"],
    scope: { id: "storage" },
    mutationFn: deleteStorageArea,
    onSuccess: (deletion, id) => applyStorageDeletion(queryClient, deletion, { kind: "area", id }),
  });
}
