import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Storage, StorageCategory, type StorageUsage } from "@jaquelene/ipc/renderer";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { campaignQueryKey } from "@/feature/campaign/query";
import { defaultCampaignModelQuery } from "@/feature/campaign/preferences";
import { resetModelProvider } from "@/feature/model/catalog-query";
import { favoriteModelsQuery } from "@/feature/model/favorite-models";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  openRouterConfigurationQuery,
  openRouterProvider,
} from "@/feature/provider/openrouter/query";
import { scenarioQueryKey } from "@/feature/scenario/query";
import { threadQueryKey } from "@/feature/thread/query";
import { ipcMutationOptions, requireIpcMethod } from "@/ipc";

export const measureStorageUsage = requireIpcMethod(Storage?.measureUsage);
const deleteStorageCategory = requireIpcMethod(Storage?.deleteCategory);

const contentQueryKeys = [scenarioQueryKey, campaignQueryKey, threadQueryKey] as const;
const appDataQueryKeys = [
  favoriteModelsQuery.queryKey,
  userInterfacePreferencesQuery.queryKey,
  defaultCampaignModelQuery.queryKey,
  openRouterConfigurationQuery.queryKey,
] as const;

async function cancelCategoryQueries(queryClient: QueryClient, id: StorageCategory) {
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

async function refreshCategoryQueries(queryClient: QueryClient, id: StorageCategory) {
  if (id === StorageCategory.Content) {
    for (const queryKey of contentQueryKeys) {
      queryClient.removeQueries({ queryKey });
    }

    return;
  }

  if (id === StorageCategory.AppData) {
    await Promise.all([
      ...appDataQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey, exact: true }),
      ),
      resetModelProvider(queryClient, openRouterProvider.id),
    ]);
  }
}

export function useDeleteStorageCategory() {
  const queryClient = useQueryClient();

  return useMutation<StorageUsage, Error, StorageCategory>({
    ...ipcMutationOptions,
    mutationKey: ["storage", "delete-category"],
    scope: { id: "storage" },
    mutationFn: deleteStorageCategory,
    onMutate: (id) => cancelCategoryQueries(queryClient, id),
    onSettled(_usage, _error, id) {
      void refreshCategoryQueries(queryClient, id).catch((cause: unknown) => {
        reportError("storage.cache.refresh", cause, ErrorSeverity.Warning);
      });
    },
  });
}
