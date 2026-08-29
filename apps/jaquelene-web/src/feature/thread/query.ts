import { Threads } from "@jaquelene/ipc/renderer";
import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listThreadMessages = requireIpcMethod(Threads?.listMessages);
const appendUserMessage = requireIpcMethod(Threads?.appendUserMessage);
export const threadQueryKey = ["threads"] as const;

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

export function useAppendUserMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...threadQueryKey, "append-user-message"],
    mutationFn: ({ threadId, content }: { threadId: string; content: string }) =>
      appendUserMessage(threadId, content),
    onSuccess(message) {
      void queryClient.invalidateQueries({
        queryKey: threadMessagesQuery(message.threadId).queryKey,
        exact: true,
      });
    },
  });
}
