import { skipToken, type QueryClient } from "@tanstack/react-query";
import { threadQueryPrefix } from "@/feature/cache-keys";

export type ThreadDraft = Readonly<{ content: string }>;

const emptyDraft: ThreadDraft = { content: "" };

function draftQueryKey(threadId: string) {
  return [...threadQueryPrefix(threadId), "draft"] as const;
}

export function readThreadDraft(queryClient: QueryClient, threadId: string): ThreadDraft {
  return queryClient.getQueryData<ThreadDraft>(draftQueryKey(threadId)) ?? emptyDraft;
}

export function writeThreadDraft(queryClient: QueryClient, threadId: string, content: string) {
  // Unsent text belongs to the application session, including time spent on other pages.
  // Keep each edit's identity so a failed submission cannot overwrite a newer edit.
  const query = queryClient.getQueryCache().build<ThreadDraft>(queryClient, {
    queryKey: draftQueryKey(threadId),
    queryFn: skipToken,
    gcTime: Infinity,
    structuralSharing: false,
  });
  return query.setData({ content }, { manual: true });
}

export function subscribeToThreadDraft(
  queryClient: QueryClient,
  threadId: string,
  onChange: () => void,
) {
  const draftKey = draftQueryKey(threadId);
  return queryClient.getQueryCache().subscribe(({ query }) => {
    const key = query.queryKey;
    if (key.length === draftKey.length && draftKey.every((part, index) => key[index] === part)) {
      onChange();
    }
  });
}

export function settleThreadDraft(
  queryClient: QueryClient,
  threadId: string,
  clearedDraft: ThreadDraft,
  failedDraft?: ThreadDraft,
) {
  if (queryClient.getQueryData(draftQueryKey(threadId)) !== clearedDraft) return;

  if (failedDraft) {
    writeThreadDraft(queryClient, threadId, failedDraft.content);
    return;
  }

  queryClient.removeQueries({ queryKey: draftQueryKey(threadId), exact: true });
}
