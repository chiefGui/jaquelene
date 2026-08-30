import {
  Threads,
  Turns,
  type ModelReference,
  type TurnAcceptance,
  type TurnSettlement,
} from "@jaquelene/ipc/renderer";
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
import { mergeThreadTurnState, type ThreadQueryData } from "./thread-query-cache";

const listThreadMessages = requireIpcMethod(Threads?.listMessages);
const submitTurn = requireIpcMethod(Turns?.submit);
const retryTurn = requireIpcMethod(Turns?.retry);
const onTurnSettled = requireIpcMethod(Turns?.onSettled);
export const threadQueryKey = ["threads"] as const;

type TurnOperation = "submit" | "retry" | "settle";
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

function reconcileSubmission(
  queryClient: QueryClient,
  threadId: string,
  operation: TurnOperation,
  state: TurnAcceptance | TurnSettlement,
) {
  const query = threadMessagesQuery(threadId);
  const current = queryClient.getQueryData<ThreadQueryData>(query.queryKey);

  if (!current) {
    return;
  }

  const updated = mergeThreadTurnState(current, threadId, operation, state);

  if (updated) {
    queryClient.setQueryData(query.queryKey, updated);
    return;
  }

  reportError(
    "thread.turn.reconcile",
    new Error(`Could not reconcile ${operation} state for thread "${threadId}".`),
  );
  return queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
}

function reconcileUnexpectedFailure(queryClient: QueryClient, threadId: string) {
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
  return onTurnSettled((settlement) => {
    try {
      void Promise.resolve(
        reconcileSubmission(queryClient, settlement.turn.threadId, "settle", settlement),
      ).catch((cause: unknown) => reportError("thread.turn.settlement", cause));
    } catch (cause) {
      reportError("thread.turn.settlement", cause);
    }
  });
}

export function useSubmitTurn(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "submit"],
    scope: turnMutationScope(threadId),
    mutationFn: ({ content, model }: SubmitTurnVariables) =>
      submitTurn({ threadId, content, model: copyModelReference(model) }),
    onSuccess(submission) {
      return reconcileSubmission(queryClient, threadId, "submit", submission);
    },
    onError() {
      return reconcileUnexpectedFailure(queryClient, threadId);
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
    onSuccess(submission) {
      return reconcileSubmission(queryClient, threadId, "retry", submission);
    },
    onError() {
      return reconcileUnexpectedFailure(queryClient, threadId);
    },
  });
}
