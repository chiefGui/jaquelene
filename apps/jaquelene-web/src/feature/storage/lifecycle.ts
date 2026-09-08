import { StorageCategory } from "@jaquelene/ipc/renderer";
import type {
  MutationFilters,
  MutationKey,
  QueryClient,
  QueryFilters,
} from "@tanstack/react-query";

export const appDataStorageMeta = { storageCategory: StorageCategory.AppData } as const;
export const deleteStorageCategoryMutationKey = ["storage", "delete-category"] as const;

export function storageQueries(category: StorageCategory): QueryFilters {
  return { predicate: (query) => query.meta?.storageCategory === category };
}

export function storageDeletion(category: StorageCategory): MutationFilters {
  return {
    mutationKey: deleteStorageCategoryMutationKey,
    exact: true,
    status: "pending",
    predicate: (mutation) => mutation.state.variables === category,
  };
}

export function dispatchStorageWrite(
  queryClient: QueryClient,
  category: StorageCategory,
  mutationKey: MutationKey,
  dispatch: () => void,
) {
  if (
    queryClient.isMutating(storageDeletion(category)) > 0 ||
    queryClient.isMutating({ mutationKey, exact: true }) > 0
  ) {
    return false;
  }
  dispatch();
  return true;
}

export function waitForStorageWrites(queryClient: QueryClient, category: StorageCategory) {
  const filter: MutationFilters = {
    predicate: (mutation) => mutation.meta?.storageCategory === category,
  };
  return new Promise<void>((resolve) => {
    const check = () => {
      if (queryClient.isMutating(filter) === 0) {
        unsubscribe();
        resolve();
      }
    };
    const unsubscribe = queryClient.getMutationCache().subscribe(check);
    check();
  });
}
