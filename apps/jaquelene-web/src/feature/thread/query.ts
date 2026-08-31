import { Threads, Turns, type ModelReference } from "@jaquelene/ipc/renderer";
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
  reconcileThreadTurn,
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
  model: ModelReference;
};

export function threadMessagesQuery(threadId: string) {
  return infiniteQueryOptions({
    ...ipcQueryOptions,
    queryKey: [...threadQueryKey, threadId, "messages"],
    initialPageParam: "",
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

function copyModelReference({ providerId, modelId }: ModelReference): ModelReference {
  return { providerId, modelId };
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
  const queryKey = threadMessagesQuery(threadId).queryKey;
  return queryClient.invalidateQueries({ queryKey, exact: true });
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

export function useSubmitTurn(threadId: string, onAccepted: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "submit"],
    scope: turnMutationScope(threadId),
    mutationFn: ({ content, model }: SubmitTurnVariables) =>
      submitTurn({ threadId, content, model: copyModelReference(model) }),
    onSuccess(submission) {
      try {
        onAccepted();
      } catch (cause) {
        reportError("thread.turn.accepted", cause);
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
    mutationFn: ({ turnId, model }: { turnId: string; model: ModelReference }) =>
      retryTurn({ turnId, model: copyModelReference(model) }),
    onSuccess(generation) {
      return reconcileTurn(queryClient, threadId, { type: "retry-accepted", generation });
    },
    onError() {
      return reloadThread(queryClient, threadId);
    },
  });
}
