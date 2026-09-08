import { ErrorSeverity } from "@jaquelene/diagnostics";
import {
  Storage,
  StorageCategory,
  type StorageDeletion,
  type StorageUsage,
} from "@jaquelene/ipc/renderer";
import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  campaignQueryKey,
  promptQueryKey,
  threadQueryKey,
  usageQueryKey,
} from "@/feature/cache-keys";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import { reconcileStorageDeletion, type StorageDeletionTarget } from "./usage";
import {
  deleteStorageCategoryMutationKey,
  storageQueries,
  waitForStorageWrites,
} from "./lifecycle";

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

const contentQueryKeys = [campaignQueryKey, promptQueryKey, threadQueryKey, usageQueryKey] as const;
const cacheQueryFilter = storageQueries(StorageCategory.Cache);
const appDataQueryFilter = storageQueries(StorageCategory.AppData);

async function cancelCategoryQueries(queryClient: QueryClient, id: StorageCategory) {
  await waitForStorageWrites(queryClient, id);
  if (id === StorageCategory.Cache) {
    await queryClient.cancelQueries(cacheQueryFilter);
    return;
  }

  if (id === StorageCategory.Content) {
    await Promise.all(contentQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    return;
  }

  if (id === StorageCategory.AppData) {
    await queryClient.cancelQueries(appDataQueryFilter);
  }
}

async function refreshCategoryQueries(queryClient: QueryClient, id: StorageCategory) {
  if (id === StorageCategory.Cache) {
    await queryClient.resetQueries(cacheQueryFilter);
    return;
  }

  if (id === StorageCategory.Content) {
    for (const queryKey of contentQueryKeys) {
      queryClient.removeQueries({ queryKey });
    }

    return;
  }

  if (id === StorageCategory.AppData) {
    await queryClient.invalidateQueries(appDataQueryFilter);
  }
}

export function deleteStorageCategoryMutationOptions(queryClient: QueryClient) {
  return mutationOptions<StorageDeletion, Error, StorageCategory>({
    ...ipcMutationOptions,
    mutationKey: deleteStorageCategoryMutationKey,
    scope: { id: "storage" },
    mutationFn: deleteStorageCategory,
    onMutate: (id) => cancelCategoryQueries(queryClient, id),
    onSuccess: (deletion, id) =>
      applyStorageDeletion(queryClient, deletion, { kind: "category", id }),
    onSettled(_usage, _error, id) {
      return refreshCategoryQueries(queryClient, id).catch((cause: unknown) => {
        reportError("storage.category.refresh", cause, ErrorSeverity.Warning);
      });
    },
  });
}

export function useDeleteStorageCategory() {
  const queryClient = useQueryClient();
  return useMutation(deleteStorageCategoryMutationOptions(queryClient));
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
