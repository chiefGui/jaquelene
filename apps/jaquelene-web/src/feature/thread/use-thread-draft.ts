import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { readThreadDraft, subscribeToThreadDraft, writeThreadDraft } from "./draft";

export function useThreadDraft(threadId: string) {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToThreadDraft(queryClient, threadId, onChange),
    [queryClient, threadId],
  );
  const getSnapshot = useCallback(
    () => readThreadDraft(queryClient, threadId),
    [queryClient, threadId],
  );
  const draft = useSyncExternalStore(subscribe, getSnapshot);
  const setDraft = useCallback(
    (content: string) => writeThreadDraft(queryClient, threadId, content),
    [queryClient, threadId],
  );

  return { draft, setDraft };
}
