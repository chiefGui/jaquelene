import {
  type CampaignGenerationPreferences,
  Campaigns,
  type Campaign,
  type CampaignDeletion,
  type CampaignPage,
  type CampaignSummary,
  type StartCampaignRequest,
} from "@jaquelene/ipc/renderer";
import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import {
  campaignListQueryKey,
  campaignPromptSelectionPrefix,
  campaignRecordQueryKey,
  campaignUsageRecordQueryKey,
  threadQueryPrefix,
} from "@/feature/cache-keys";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import { campaignMutationKey, campaignMutationScope } from "./mutation";

const startCampaign = requireIpcMethod(Campaigns?.start);
const listCampaigns = requireIpcMethod(Campaigns?.list);
const getCampaign = requireIpcMethod(Campaigns?.get);
const deleteCampaign = requireIpcMethod(Campaigns?.delete);
const renameCampaign = requireIpcMethod(Campaigns?.rename);
const setCampaignGenerationPreferences = requireIpcMethod(Campaigns?.setGenerationPreferences);
export { campaignQueryKey } from "@/feature/cache-keys";

export const campaignPagesQuery = infiniteQueryOptions({
  ...ipcQueryOptions,
  queryKey: campaignListQueryKey,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => listCampaigns(pageParam ? { cursor: pageParam } : {}),
  getNextPageParam: (page) => page.nextCursor,
});

export function campaignQuery(id: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: campaignRecordQueryKey(id),
    queryFn: () => getCampaign(id),
  });
}

function setCampaignGenerationPreferencesMutationKey(id: string) {
  return [...campaignMutationKey(id), "generation-preferences"] as const;
}

type SetCampaignGenerationPreferencesContext = {
  sequence: PreferencesMutationSequence;
  version: number;
};

type PreferencesMutationSequence = {
  confirmedCampaign: Campaign | null | undefined;
  initialized: boolean;
  latestVersion: number;
  pending: number;
};

const preferencesMutationSequences = new WeakMap<
  QueryClient,
  Map<string, PreferencesMutationSequence>
>();

function withoutGenerationPreferences(campaign: Campaign): Campaign {
  const inheritedCampaign = { ...campaign };
  delete inheritedCampaign.generationPreferences;
  return inheritedCampaign;
}

function cacheCampaign(queryClient: QueryClient, campaign: Campaign) {
  queryClient.setQueryData(campaignQuery(campaign.id).queryKey, campaign);
}

function updateCampaignSummaries(
  queryClient: QueryClient,
  update: (campaigns: readonly CampaignSummary[]) => readonly CampaignSummary[],
) {
  queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, (data) => {
    if (!data) {
      return data;
    }

    const campaigns = update(data.pages.flatMap((page) => page.campaigns));
    let offset = 0;
    const pages = data.pages.map((page) => {
      const pageCampaigns = campaigns.slice(offset, offset + page.campaigns.length);
      offset += page.campaigns.length;
      return { ...page, campaigns: pageCampaigns };
    });

    return { ...data, pages };
  });
}

function compareCampaignActivity(left: CampaignSummary, right: CampaignSummary) {
  if (left.lastActivityAt !== right.lastActivityAt) {
    return right.lastActivityAt - left.lastActivityAt;
  }

  return left.threadId < right.threadId ? 1 : left.threadId === right.threadId ? 0 : -1;
}

export function updateCampaignActivity(
  queryClient: QueryClient,
  update: Readonly<{
    threadId: string;
    lastActivityAt: number;
    turnCount: number;
    allowActivityRewind?: boolean;
  }>,
) {
  const data = queryClient.getQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey);
  let campaignFound = false;

  updateCampaignSummaries(queryClient, (campaigns) => {
    const campaign = campaigns.find((candidate) => candidate.threadId === update.threadId);

    if (!campaign) {
      return campaigns;
    }

    campaignFound = true;

    const updatedCampaign = {
      ...campaign,
      lastActivityAt: update.allowActivityRewind
        ? update.lastActivityAt
        : Math.max(campaign.lastActivityAt, update.lastActivityAt),
      turnCount: update.turnCount,
    };

    return [
      updatedCampaign,
      ...campaigns.filter((candidate) => candidate.id !== updatedCampaign.id),
    ].sort(compareCampaignActivity);
  });

  return (
    !campaignFound ||
    !data ||
    data.pages.length > 1 ||
    data.pages.some((page) => page.nextCursor !== undefined)
  );
}

export function invalidateCampaignPages(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: campaignPagesQuery.queryKey, exact: true });
}

function updateCampaignSummaryTitle(queryClient: QueryClient, campaign: Campaign) {
  updateCampaignSummaries(queryClient, (campaigns) =>
    campaigns.map((candidate) =>
      candidate.id === campaign.id ? { ...candidate, title: campaign.title } : candidate,
    ),
  );
}

function beginPreferencesMutation(queryClient: QueryClient, id: string) {
  let sequences = preferencesMutationSequences.get(queryClient);

  if (!sequences) {
    sequences = new Map();
    preferencesMutationSequences.set(queryClient, sequences);
  }

  let sequence = sequences.get(id);

  if (!sequence) {
    sequence = {
      confirmedCampaign: undefined,
      initialized: false,
      latestVersion: 0,
      pending: 0,
    };
    sequences.set(id, sequence);
  }

  sequence.latestVersion += 1;
  sequence.pending += 1;
  return { sequence, version: sequence.latestVersion };
}

function endPreferencesMutation(
  queryClient: QueryClient,
  id: string,
  context: SetCampaignGenerationPreferencesContext | undefined,
) {
  if (!context) {
    return;
  }

  context.sequence.pending -= 1;

  if (context.sequence.pending > 0) {
    return;
  }

  const sequences = preferencesMutationSequences.get(queryClient);

  if (sequences?.get(id) === context.sequence) {
    sequences.delete(id);

    if (sequences.size === 0) {
      preferencesMutationSequences.delete(queryClient);
    }
  }
}

export function setCampaignGenerationPreferencesMutationOptions(
  queryClient: QueryClient,
  id: string,
) {
  const query = campaignQuery(id);

  return mutationOptions<
    Campaign,
    Error,
    CampaignGenerationPreferences | null,
    SetCampaignGenerationPreferencesContext
  >({
    ...ipcMutationOptions,
    mutationKey: setCampaignGenerationPreferencesMutationKey(id),
    scope: campaignMutationScope(id),
    async mutationFn(preferences) {
      const campaign = await setCampaignGenerationPreferences(id, preferences);

      if (!campaign) {
        throw new Error(`Campaign "${id}" is unavailable.`);
      }

      return campaign;
    },
    async onMutate(preferences) {
      const context = beginPreferencesMutation(queryClient, id);
      await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
      const previousCampaign = queryClient.getQueryData<Campaign | null>(query.queryKey);

      if (!context.sequence.initialized) {
        context.sequence.confirmedCampaign = previousCampaign;
        context.sequence.initialized = true;
      }

      if (previousCampaign && context.version === context.sequence.latestVersion) {
        cacheCampaign(
          queryClient,
          preferences
            ? {
                ...previousCampaign,
                generationPreferences: {
                  ...(preferences.model ? { model: { ...preferences.model } } : {}),
                  ...(preferences.reasoningPreset === undefined
                    ? {}
                    : { reasoningPreset: preferences.reasoningPreset }),
                },
              }
            : withoutGenerationPreferences(previousCampaign),
        );
      }

      return context;
    },
    onError(_error, _preferences, context) {
      if (
        context &&
        context.version === context.sequence.latestVersion &&
        context.sequence.confirmedCampaign
      ) {
        cacheCampaign(queryClient, context.sequence.confirmedCampaign);
      }
    },
    onSuccess(campaign, _preferences, context) {
      context.sequence.confirmedCampaign = campaign;

      if (context.version === context.sequence.latestVersion) {
        cacheCampaign(queryClient, campaign);
      }
    },
    onSettled(_campaign, _error, _preferences, context) {
      endPreferencesMutation(queryClient, id, context);
    },
  });
}

export function useSetCampaignGenerationPreferences(id: string) {
  const queryClient = useQueryClient();
  return useMutation(setCampaignGenerationPreferencesMutationOptions(queryClient, id));
}

export function useIsCampaignGenerationPreferencesPending(id: string) {
  return useIsMutating({ mutationKey: setCampaignGenerationPreferencesMutationKey(id) }) > 0;
}

export function useIsCampaignMutationPending(id: string) {
  return useIsMutating({ mutationKey: campaignMutationKey(id) }) > 0;
}

function removeCampaignFromPages(data: InfiniteData<CampaignPage> | undefined, id: string) {
  return data
    ? {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          campaigns: page.campaigns.filter((campaign) => campaign.id !== id),
        })),
      }
    : data;
}

export function deleteCampaignMutationOptions(
  queryClient: QueryClient,
  campaign: Pick<Campaign, "id" | "threadId">,
) {
  const campaignKey = campaignRecordQueryKey(campaign.id);
  const usageKey = campaignUsageRecordQueryKey(campaign.id);
  const threadKey = threadQueryPrefix(campaign.threadId);
  const promptSelectionKey = campaignPromptSelectionPrefix(campaign.id);

  return mutationOptions<CampaignDeletion, Error, void>({
    ...ipcMutationOptions,
    mutationKey: [...campaignMutationKey(campaign.id), "delete"],
    scope: campaignMutationScope(campaign.id),
    async mutationFn() {
      const deletion = await deleteCampaign(campaign.id);

      if (!deletion) {
        throw new Error(`Campaign "${campaign.id}" is unavailable.`);
      }

      return deletion;
    },
    async onMutate() {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: campaignKey, exact: true }),
        queryClient.cancelQueries({ queryKey: campaignPagesQuery.queryKey, exact: true }),
        queryClient.cancelQueries({ queryKey: usageKey, exact: true }),
        queryClient.cancelQueries({ queryKey: threadKey }),
        queryClient.cancelQueries({ queryKey: promptSelectionKey }),
      ]);
    },
    onSuccess(deletion) {
      queryClient.setQueryData<Campaign | null>(campaignKey, null);
      queryClient.setQueryData(usageKey, null);
      queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, (data) =>
        removeCampaignFromPages(data, deletion.id),
      );
      queryClient.removeQueries({ queryKey: threadQueryPrefix(deletion.threadId) });
      queryClient.removeQueries({ queryKey: promptSelectionKey });
      void queryClient.invalidateQueries({
        queryKey: campaignPagesQuery.queryKey,
        exact: true,
      });
    },
  });
}

export function useDeleteCampaign(campaign: Pick<Campaign, "id" | "threadId">) {
  const queryClient = useQueryClient();
  return useMutation(deleteCampaignMutationOptions(queryClient, campaign));
}

export function startCampaignMutationOptions(queryClient: QueryClient) {
  return mutationOptions<Campaign, Error, StartCampaignRequest>({
    ...ipcMutationOptions,
    mutationFn: startCampaign,
    onSuccess(campaign) {
      queryClient.setQueryData(campaignQuery(campaign.id).queryKey, campaign);
      const summary: CampaignSummary = {
        id: campaign.id,
        title: campaign.title,
        threadId: campaign.threadId,
        lastActivityAt: campaign.startedAt,
        turnCount: 0,
      };
      const list = queryClient.getQueryData<InfiniteData<CampaignPage>>(
        campaignPagesQuery.queryKey,
      );
      const firstPage = list?.pages[0];

      if (list && firstPage) {
        queryClient.setQueryData<InfiniteData<CampaignPage>>(campaignPagesQuery.queryKey, {
          ...list,
          pages: [
            {
              ...firstPage,
              campaigns: [
                summary,
                ...firstPage.campaigns.filter((candidate) => candidate.id !== campaign.id),
              ].sort(compareCampaignActivity),
            },
            ...list.pages.slice(1),
          ],
        });
      }

      void invalidateCampaignPages(queryClient);
    },
  });
}

export function useStartCampaign() {
  const queryClient = useQueryClient();
  return useMutation(startCampaignMutationOptions(queryClient));
}

export function useRenameCampaign(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Campaign, Error, string>({
    ...ipcMutationOptions,
    mutationKey: [...campaignMutationKey(id), "rename"],
    scope: campaignMutationScope(id),
    async mutationFn(title) {
      const campaign = await renameCampaign({ id, title });

      if (!campaign) {
        throw new Error(`Campaign "${id}" is unavailable.`);
      }

      return campaign;
    },
    onSuccess(campaign) {
      cacheCampaign(queryClient, campaign);
      updateCampaignSummaryTitle(queryClient, campaign);
    },
  });
}
