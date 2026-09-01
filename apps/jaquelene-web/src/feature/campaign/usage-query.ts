import { CampaignUsage } from "@jaquelene/ipc/renderer";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getCampaignUsage = requireIpcMethod(CampaignUsage?.get);

export const campaignUsageQueryKey = ["usage", "campaign"] as const;

export function campaignUsageQuery(id: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignUsageQueryKey, id],
    queryFn: () => getCampaignUsage(id),
    refetchInterval(query) {
      const usage = query.state.data;

      return usage && (usage.attempts.preparing > 0 || usage.attempts.pending > 0) ? 1_000 : false;
    },
  });
}

export function invalidateCampaignUsage(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: campaignUsageQueryKey });
}
