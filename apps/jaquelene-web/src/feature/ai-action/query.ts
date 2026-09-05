import { AiActionPreferences, AiActionRunner } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";
import { reportError } from "@/feature/diagnostics/diagnostics";

export const runAiAction = requireIpcMethod(AiActionRunner?.run);
export const cancelAiAction = requireIpcMethod(AiActionRunner?.cancel);
const listAiActions = requireIpcMethod(AiActionRunner?.list);
const getModel = requireIpcMethod(AiActionPreferences?.getModel);
const setModel = requireIpcMethod(AiActionPreferences?.setModel);

export const aiActionModelQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "ai-action", "model"],
  queryFn: getModel,
});

export function aiActionsQuery(target: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: ["ai-action", "definitions", target],
    queryFn: () => listAiActions(target),
  });
}

export function useSetAiActionModel() {
  const queryClient = useQueryClient();
  return useMutation({
    ...ipcMutationOptions,
    mutationKey: ["preferences", "ai-action", "set-model"],
    scope: { id: "ai-action-model" },
    mutationFn: setModel,
    onSuccess(model) {
      queryClient.setQueryData(aiActionModelQuery.queryKey, model);
    },
    onError(cause) {
      reportError("ai-action.model.update", cause);
    },
  });
}
