import { Usage, type UsagePeriod } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getUsageOverview = requireIpcMethod(Usage?.getOverview);
const clearUsage = requireIpcMethod(Usage?.clear);

export const usageQueryKey = ["usage"] as const;

export function usageOverviewQuery(period: UsagePeriod) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...usageQueryKey, "overview", period],
    queryFn: () => getUsageOverview(period),
  });
}

export function useClearUsageHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...usageQueryKey, "clear"],
    mutationFn: clearUsage,
    onSuccess() {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: usageQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["storage", "usage"] }),
      ]);
    },
  });
}
