import {
  ThreadMessagePageDirection,
  Threads,
  Turns,
  type GenerationConfiguration,
  type ThreadMessagePageRequest,
} from "@jaquelene/ipc/renderer";
import {
  type QueryClient,
  infiniteQueryOptions,
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { invalidateCampaignPages, updateCampaignActivity } from "@/feature/campaign/query";
import { invalidateCampaignUsage } from "@/feature/campaign/usage-query";
import { threadQueryKey } from "@/feature/cache-keys";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import {
  THREAD_HISTORY_RETAINED_PAGE_LIMIT,
  createLatestThreadHistory,
  isLatestThreadHistory,
  latestThreadHistoryPageParam,
  reconcileThreadTurn,
  requireValidThreadHistory,
  retainThreadHistory,
  type ThreadHistoryPageParam,
  type ThreadQueryData,
  type ThreadTurnUpdate,
} from "./thread-query-cache";

const listThreadMessages = requireIpcMethod(Threads?.listMessages);
const getThreadTranscript = requireIpcMethod(Threads?.getTranscript);
const submitTurn = requireIpcMethod(Turns?.submit);
const retryTurn = requireIpcMethod(Turns?.retry);
const regenerateReply = requireIpcMethod(Turns?.regenerate);
const deleteThreadHistory = requireIpcMethod(Turns?.deleteFrom);
const onHistoryDeleted = requireIpcMethod(Turns?.onHistoryDeleted);
const onReplyFailed = requireIpcMethod(Turns?.onReplyFailed);
const onReplyCompleted = requireIpcMethod(Turns?.onReplyCompleted);
const onReplySuperseded = requireIpcMethod(Turns?.onReplySuperseded);
export { threadQueryKey } from "@/feature/cache-keys";

export type SubmitTurnVariables = {
  clientId: string;
  content: string;
  submittedAt: number;
  configuration: GenerationConfiguration;
};

function toThreadMessagePageRequest(
  threadId: string,
  pageParam: ThreadHistoryPageParam,
): ThreadMessagePageRequest {
  if (pageParam.kind === "latest") {
    return { threadId, direction: ThreadMessagePageDirection.Older };
  }

  return {
    threadId,
    direction:
      pageParam.direction === "older"
        ? ThreadMessagePageDirection.Older
        : ThreadMessagePageDirection.Newer,
    cursor: pageParam.cursor,
  };
}

export function threadMessagesQuery(threadId: string) {
  return infiniteQueryOptions({
    ...ipcQueryOptions,
    queryKey: [...threadQueryKey, threadId, "messages"],
    initialPageParam: latestThreadHistoryPageParam,
    maxPages: THREAD_HISTORY_RETAINED_PAGE_LIMIT,
    queryFn: ({ pageParam }) => listThreadMessages(toThreadMessagePageRequest(threadId, pageParam)),
    getNextPageParam: (page) =>
      page.olderCursor
        ? ({ kind: "cursor", direction: "older", cursor: page.olderCursor } as const)
        : undefined,
    getPreviousPageParam: (page) =>
      page.newerCursor
        ? ({ kind: "cursor", direction: "newer", cursor: page.newerCursor } as const)
        : undefined,
    select: (data) => requireValidThreadHistory(data, threadId),
  });
}

export function loadThreadTranscript(threadId: string) {
  return getThreadTranscript(threadId);
}

function turnMutationScope(threadId: string) {
  return { id: `thread:${threadId}:generation` };
}

function turnMutationKey(threadId: string) {
  return [...threadQueryKey, threadId, "turn"] as const;
}

function copyGenerationConfiguration(
  configuration: GenerationConfiguration,
): GenerationConfiguration {
  return {
    model: {
      providerId: configuration.model.providerId,
      modelId: configuration.model.modelId,
    },
    ...(configuration.reasoningPreset === undefined
      ? {}
      : { reasoningPreset: configuration.reasoningPreset }),
  };
}

function reconcileTurn(queryClient: QueryClient, threadId: string, update: ThreadTurnUpdate) {
  const query = threadMessagesQuery(threadId);
  const current = queryClient.getQueryData<ThreadQueryData>(query.queryKey);

  if (!current) {
    return;
  }

  const reconciliation = reconcileThreadTurn(current, threadId, update);

  switch (reconciliation.outcome) {
    case "updated":
      queryClient.setQueryData(query.queryKey, reconciliation.data);
      return;
    case "current":
    case "historical":
      return;
    case "reload":
      reportError(
        "thread.turn.reconcile",
        new Error(`Could not apply ${update.type} to thread "${threadId}".`),
      );
      return queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
  }
}

function reloadThread(queryClient: QueryClient, threadId: string) {
  const query = threadMessagesQuery(threadId);
  const current = queryClient.getQueryData<ThreadQueryData>(query.queryKey);

  if (current && !isLatestThreadHistory(current)) {
    return Promise.resolve();
  }

  return queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
}

function refreshCampaignUsage(queryClient: QueryClient) {
  void invalidateCampaignUsage(queryClient).catch((cause: unknown) =>
    reportError("campaign.usage.refresh", cause),
  );
}

function refreshCampaignPages(queryClient: QueryClient) {
  void invalidateCampaignPages(queryClient).catch((cause: unknown) =>
    reportError("campaign.sidebar.refresh", cause),
  );
}

export function retainLoadedThreadMessages(
  queryClient: QueryClient,
  threadId: string,
  direction: "older" | "newer",
) {
  const queryKey = threadMessagesQuery(threadId).queryKey;

  queryClient.setQueryData<ThreadQueryData>(queryKey, (current) =>
    current ? retainThreadHistory(current, direction === "older" ? "oldest" : "newest") : current,
  );
}

export function useReturnToLatestThreadMessages(threadId: string) {
  const queryClient = useQueryClient();
  const queryKey = threadMessagesQuery(threadId).queryKey;

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...threadQueryKey, threadId, "return-to-latest"],
    mutationFn: () => listThreadMessages({ threadId, direction: ThreadMessagePageDirection.Older }),
    onSuccess(page) {
      queryClient.setQueryData<ThreadQueryData>(
        queryKey,
        createLatestThreadHistory(page, threadId),
      );
    },
  });
}

export function useIsTurnOperationPending(threadId: string) {
  return useIsMutating({ mutationKey: turnMutationKey(threadId) }) > 0;
}

export function usePendingTurnSubmission(threadId: string) {
  const pending = useMutationState<SubmitTurnVariables>({
    filters: {
      exact: true,
      mutationKey: [...turnMutationKey(threadId), "submit"],
      status: "pending",
    },
    select: (mutation) => mutation.state.variables as SubmitTurnVariables,
  });

  return pending.at(-1) ?? null;
}

export function installThreadReconciliation(queryClient: QueryClient) {
  function runReconciliation(
    operation: "thread.turn.settlement" | "thread.history.delete.reconcile",
    reconcile: () => unknown,
  ) {
    try {
      void Promise.resolve(reconcile()).catch((cause: unknown) => reportError(operation, cause));
    } catch (cause) {
      reportError(operation, cause);
    }
  }

  function applyEvent(threadId: string, update: ThreadTurnUpdate) {
    refreshCampaignUsage(queryClient);
    runReconciliation("thread.turn.settlement", () => reconcileTurn(queryClient, threadId, update));
  }

  const stopFailureListener = onReplyFailed((failure) => {
    if (updateCampaignActivity(queryClient, failure.threadActivity)) {
      refreshCampaignPages(queryClient);
    }
    applyEvent(failure.userMessage.threadId, { type: "reply-failed", ...failure });
  });
  const stopCompletionListener = onReplyCompleted((completion) => {
    if (updateCampaignActivity(queryClient, completion.threadActivity)) {
      refreshCampaignPages(queryClient);
    }
    applyEvent(completion.userMessage.threadId, { type: "reply-completed", ...completion });
  });
  const stopSupersededListener = onReplySuperseded(({ threadId }) => {
    refreshCampaignUsage(queryClient);
    runReconciliation("thread.turn.settlement", () => reloadThread(queryClient, threadId));
  });
  const stopHistoryDeletedListener = onHistoryDeleted(({ threadId, threadActivity }) => {
    if (updateCampaignActivity(queryClient, threadActivity, { allowRewind: true })) {
      refreshCampaignPages(queryClient);
    }
    runReconciliation("thread.history.delete.reconcile", () =>
      queryClient.resetQueries({ queryKey: threadMessagesQuery(threadId).queryKey, exact: true }),
    );
  });

  return () => {
    stopFailureListener();
    stopCompletionListener();
    stopSupersededListener();
    stopHistoryDeletedListener();
  };
}

export function useSubmitTurn(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "submit"],
    scope: turnMutationScope(threadId),
    mutationFn: ({ content, configuration }: SubmitTurnVariables) =>
      submitTurn({
        threadId,
        content,
        configuration: copyGenerationConfiguration(configuration),
      }),
    onSuccess(submission) {
      refreshCampaignUsage(queryClient);
      if (updateCampaignActivity(queryClient, submission.threadActivity)) {
        refreshCampaignPages(queryClient);
      }
      return reconcileTurn(queryClient, threadId, {
        type: "submission-accepted",
        ...submission,
      });
    },
    onError() {
      return reloadThread(queryClient, threadId);
    },
  });
}

export function useRetryTurn(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "retry"],
    scope: turnMutationScope(threadId),
    mutationFn: ({
      turnId,
      configuration,
    }: {
      turnId: string;
      configuration: GenerationConfiguration;
    }) => retryTurn({ turnId, configuration: copyGenerationConfiguration(configuration) }),
    onSuccess(generation) {
      refreshCampaignUsage(queryClient);
      return reconcileTurn(queryClient, threadId, { type: "retry-accepted", generation });
    },
    onError() {
      return reloadThread(queryClient, threadId);
    },
  });
}

export function useRegenerateReply(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "regenerate"],
    scope: turnMutationScope(threadId),
    mutationFn: ({
      assistantMessageId,
      configuration,
    }: {
      assistantMessageId: string;
      configuration: GenerationConfiguration;
    }) =>
      regenerateReply({
        assistantMessageId,
        configuration: copyGenerationConfiguration(configuration),
      }),
    onSuccess(generation, { assistantMessageId }) {
      refreshCampaignUsage(queryClient);
      return reconcileTurn(queryClient, threadId, {
        type: "regeneration-accepted",
        assistantMessageId,
        generation,
      });
    },
    onError() {
      return reloadThread(queryClient, threadId);
    },
  });
}

export function useDeleteThreadHistoryFromMessage(threadId: string) {
  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "delete-history-from-message"],
    mutationFn: (userMessageId: string) => deleteThreadHistory({ threadId, userMessageId }),
  });
}
