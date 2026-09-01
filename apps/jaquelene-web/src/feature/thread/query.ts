import { Threads, Turns, type GenerationConfiguration } from "@jaquelene/ipc/renderer";
import {
  type QueryClient,
  infiniteQueryOptions,
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import {
  THREAD_HISTORY_RETAINED_PAGE_LIMIT,
  createLatestThreadHistory,
  isLatestThreadHistory,
  reconcileThreadTurn,
  retainThreadHistory,
  type ThreadQueryData,
  type ThreadTurnUpdate,
} from "./thread-query-cache";

const listThreadMessages = requireIpcMethod(Threads?.listMessages);
const submitTurn = requireIpcMethod(Turns?.submit);
const retryTurn = requireIpcMethod(Turns?.retry);
const onReplyFailed = requireIpcMethod(Turns?.onReplyFailed);
const onReplyCompleted = requireIpcMethod(Turns?.onReplyCompleted);
const onReplySuperseded = requireIpcMethod(Turns?.onReplySuperseded);
export const threadQueryKey = ["threads"] as const;

export type SubmitTurnVariables = {
  clientId: string;
  content: string;
  submittedAt: number;
  configuration: GenerationConfiguration;
};

export function threadMessagesQuery(threadId: string) {
  return infiniteQueryOptions({
    ...ipcQueryOptions,
    queryKey: [...threadQueryKey, threadId, "messages"],
    initialPageParam: "",
    maxPages: THREAD_HISTORY_RETAINED_PAGE_LIMIT,
    queryFn: ({ pageParam }) =>
      listThreadMessages({
        threadId,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
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

export function retainLoadedOlderThreadMessages(queryClient: QueryClient, threadId: string) {
  const queryKey = threadMessagesQuery(threadId).queryKey;

  queryClient.setQueryData<ThreadQueryData>(queryKey, (current) =>
    current ? retainThreadHistory(current, "oldest") : current,
  );
}

export function useReturnToLatestThreadMessages(threadId: string) {
  const queryClient = useQueryClient();
  const queryKey = threadMessagesQuery(threadId).queryKey;

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...threadQueryKey, threadId, "return-to-latest"],
    mutationFn: () => listThreadMessages({ threadId }),
    onSuccess(page) {
      queryClient.setQueryData<ThreadQueryData>(queryKey, createLatestThreadHistory(page));
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

export function installThreadSettlementReconciliation(queryClient: QueryClient) {
  function applyEvent(threadId: string, update: ThreadTurnUpdate) {
    try {
      void Promise.resolve(reconcileTurn(queryClient, threadId, update)).catch((cause: unknown) =>
        reportError("thread.turn.settlement", cause),
      );
    } catch (cause) {
      reportError("thread.turn.settlement", cause);
    }
  }

  const stopFailureListener = onReplyFailed((failure) => {
    applyEvent(failure.userMessage.threadId, { type: "reply-failed", ...failure });
  });
  const stopCompletionListener = onReplyCompleted((completion) => {
    applyEvent(completion.userMessage.threadId, { type: "reply-completed", ...completion });
  });
  const stopSupersededListener = onReplySuperseded(({ threadId }) => {
    try {
      void reloadThread(queryClient, threadId).catch((cause: unknown) =>
        reportError("thread.turn.settlement", cause),
      );
    } catch (cause) {
      reportError("thread.turn.settlement", cause);
    }
  });

  return () => {
    stopFailureListener();
    stopCompletionListener();
    stopSupersededListener();
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
      return reconcileTurn(queryClient, threadId, { type: "retry-accepted", generation });
    },
    onError() {
      return reloadThread(queryClient, threadId);
    },
  });
}
