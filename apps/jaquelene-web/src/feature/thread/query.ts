import { Threads, Turns, type ModelReference, type TurnSubmission } from "@jaquelene/ipc/renderer";
import {
  type QueryClient,
  infiniteQueryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import { hasPendingReply, mergeThreadSubmission, type ThreadQueryData } from "./thread-query-cache";

const listThreadMessages = requireIpcMethod(Threads?.listMessages);
const submitTurn = requireIpcMethod(Turns?.submit);
const retryTurn = requireIpcMethod(Turns?.retry);
export const threadQueryKey = ["threads"] as const;
const PENDING_GENERATION_REFRESH_INTERVAL_MS = 1_000;

type TurnOperation = "submit" | "retry";

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
    refetchInterval: ({ state }) =>
      hasPendingReply(state.data) ? PENDING_GENERATION_REFRESH_INTERVAL_MS : false,
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
  submission: TurnSubmission,
) {
  const query = threadMessagesQuery(threadId);
  const current = queryClient.getQueryData<ThreadQueryData>(query.queryKey);

  if (!current) {
    return;
  }

  const updated = mergeThreadSubmission(current, threadId, operation, submission);

  if (updated) {
    queryClient.setQueryData(query.queryKey, updated);
    return;
  }

  return queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
}

function reconcileUnexpectedFailure(queryClient: QueryClient, threadId: string) {
  const queryKey = threadMessagesQuery(threadId).queryKey;
  return queryClient.invalidateQueries({ queryKey, exact: true });
}

export function useIsTurnOperationPending(threadId: string) {
  return useIsMutating({ mutationKey: turnMutationKey(threadId) }) > 0;
}

export function useSubmitTurn(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...turnMutationKey(threadId), "submit"],
    scope: turnMutationScope(threadId),
    mutationFn: ({ content, model }: { content: string; model: ModelReference }) =>
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
