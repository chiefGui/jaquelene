import type {
  CampaignPromptSelection,
  CreatePromptRequest,
  Prompt,
  PromptDefault,
  PromptDeletion,
  UpdatePromptRequest,
} from "@jaquelene/ipc/renderer";
import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions } from "@/ipc";
import { promptIpc } from "./ipc";

export const narratorPromptKind = "narrator";
export const promptQueryKey = ["prompts"] as const;
const promptDefaultMutationKey = [...promptQueryKey, "set-default"] as const;
const campaignPromptSelectionQueryKey = [...promptQueryKey, "campaign-selection"] as const;

export const promptKindsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: [...promptQueryKey, "kinds"],
  queryFn: promptIpc.listKinds,
});

export function promptPagesQuery(kind: string) {
  return infiniteQueryOptions({
    ...ipcQueryOptions,
    queryKey: [...promptQueryKey, "kind", kind],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      promptIpc.list({ kind, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function promptQuery(key: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...promptQueryKey, "prompt", key],
    queryFn: () => promptIpc.get(key),
  });
}

export function promptDefaultQuery(kind: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...promptQueryKey, "default", kind],
    queryFn: () => promptIpc.getDefault(kind),
  });
}

export function campaignPromptSelectionQuery(campaignId: string, kind: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignPromptSelectionQueryKey, campaignId, kind],
    queryFn: () => promptIpc.getCampaignSelection({ campaignId, kind }),
  });
}

function invalidateKind(queryClient: QueryClient, kind: string) {
  return queryClient.invalidateQueries({ queryKey: promptPagesQuery(kind).queryKey });
}

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  return useMutation<Prompt, Error, CreatePromptRequest>({
    ...ipcMutationOptions,
    mutationFn: promptIpc.create,
    onSuccess(prompt) {
      queryClient.setQueryData(promptQuery(prompt.key).queryKey, prompt);
      return invalidateKind(queryClient, prompt.kind);
    },
  });
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient();
  return useMutation<Prompt, Error, UpdatePromptRequest>({
    ...ipcMutationOptions,
    async mutationFn(request) {
      const prompt = await promptIpc.update(request);

      if (!prompt) {
        throw new Error(`Prompt "${request.key}" is unavailable.`);
      }

      return prompt;
    },
    onSuccess(prompt) {
      queryClient.setQueryData(promptQuery(prompt.key).queryKey, prompt);
      return invalidateKind(queryClient, prompt.kind);
    },
  });
}

export function useDeletePrompt() {
  const queryClient = useQueryClient();
  return useMutation<PromptDeletion & { deletedPromptKey: string }, Error, string>({
    ...ipcMutationOptions,
    async mutationFn(key) {
      const deletion = await promptIpc.delete(key);

      if (!deletion) {
        throw new Error(`Prompt "${key}" is unavailable.`);
      }

      return { ...deletion, deletedPromptKey: key };
    },
    async onSuccess({ kind, deletedPromptKey }) {
      queryClient.removeQueries({ queryKey: promptQuery(deletedPromptKey).queryKey, exact: true });
      await Promise.all([
        invalidateKind(queryClient, kind),
        queryClient.invalidateQueries({ queryKey: campaignPromptSelectionQueryKey }),
        queryClient.invalidateQueries({ queryKey: promptDefaultQuery(kind).queryKey }),
      ]);
    },
  });
}

export function setPromptDefaultMutationOptions(queryClient: QueryClient, kind: string) {
  return mutationOptions<PromptDefault, Error, string>({
    ...ipcMutationOptions,
    mutationKey: [...promptDefaultMutationKey, kind],
    scope: { id: `prompt-default:${kind}` },
    mutationFn: (promptKey) => promptIpc.setDefault({ kind, promptKey }),
    onSuccess(selection) {
      queryClient.setQueryData(promptDefaultQuery(kind).queryKey, selection);
      return queryClient.invalidateQueries({ queryKey: campaignPromptSelectionQueryKey });
    },
  });
}

export function useSetPromptDefault(kind: string) {
  const queryClient = useQueryClient();
  return useMutation(setPromptDefaultMutationOptions(queryClient, kind));
}

export function useIsPromptDefaultPending(kind: string) {
  return useIsMutating({ mutationKey: [...promptDefaultMutationKey, kind] }) > 0;
}

export function useSetCampaignPromptSelection(campaignId: string, kind: string) {
  const queryClient = useQueryClient();
  return useMutation<CampaignPromptSelection, Error, string | undefined>({
    ...ipcMutationOptions,
    scope: { id: `campaign:${campaignId}:prompt:${kind}` },
    async mutationFn(promptKey) {
      const selection = await promptIpc.setCampaignSelection({
        campaignId,
        kind,
        ...(promptKey ? { promptKey } : {}),
      });

      if (!selection) {
        throw new Error(`Campaign "${campaignId}" is unavailable.`);
      }

      return selection;
    },
    onSuccess(selection) {
      queryClient.setQueryData(campaignPromptSelectionQuery(campaignId, kind).queryKey, selection);
    },
  });
}
