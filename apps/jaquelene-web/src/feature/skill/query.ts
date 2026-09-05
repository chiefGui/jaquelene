import type {
  CreateSkillRequest,
  CustomSkill,
  SkillDefault,
  SkillDeletion,
  UpdateSkillRequest,
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
import { skillSelectionQueryKey, skillQueryKey } from "@/feature/cache-keys";
import { ipcMutationOptions, ipcQueryOptions } from "@/ipc";
import { skillIpc } from "./ipc";

export { skillQueryKey } from "@/feature/cache-keys";
const skillDefaultMutationKey = [...skillQueryKey, "set-default"] as const;
const skillDeleteMutationKey = [...skillQueryKey, "delete"] as const;

function skillKindMutationScope(kind: string) {
  return { id: `skill-kind:${kind}` };
}

export const skillKindsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: [...skillQueryKey, "kinds"],
  queryFn: skillIpc.listKinds,
});

export function skillPagesQuery(kind: string) {
  return infiniteQueryOptions({
    ...ipcQueryOptions,
    queryKey: [...skillQueryKey, "kind", kind],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      skillIpc.list({ kind, ...(pageParam !== undefined && { cursor: pageParam }) }),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function skillQuery(key: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...skillQueryKey, "skill", key],
    queryFn: () => skillIpc.get(key),
  });
}

export function skillDefaultQuery(kind: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...skillQueryKey, "default", kind],
    queryFn: () => skillIpc.getDefault(kind),
  });
}

function invalidateKind(queryClient: QueryClient, kind: string) {
  return queryClient.invalidateQueries({ queryKey: skillPagesQuery(kind).queryKey });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation<CustomSkill, Error, CreateSkillRequest>({
    ...ipcMutationOptions,
    mutationFn: skillIpc.create,
    onSuccess(skill) {
      queryClient.setQueryData(skillQuery(skill.key).queryKey, skill);
      return invalidateKind(queryClient, skill.kind);
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation<CustomSkill, Error, UpdateSkillRequest>({
    ...ipcMutationOptions,
    async mutationFn(request) {
      const skill = await skillIpc.update(request);

      if (!skill) {
        throw new Error(`Skill "${request.key}" is unavailable.`);
      }

      return skill;
    },
    onSuccess(skill) {
      queryClient.setQueryData(skillQuery(skill.key).queryKey, skill);
      return invalidateKind(queryClient, skill.kind);
    },
  });
}

export function useDeleteSkill(kind: string) {
  const queryClient = useQueryClient();
  return useMutation<SkillDeletion & { deletedSkillKey: string }, Error, string>({
    ...ipcMutationOptions,
    mutationKey: [...skillDeleteMutationKey, kind],
    scope: skillKindMutationScope(kind),
    async mutationFn(key) {
      const deletion = await skillIpc.delete(key);

      if (!deletion) {
        throw new Error(`Skill "${key}" is unavailable.`);
      }

      return { ...deletion, deletedSkillKey: key };
    },
    async onSuccess({ kind, deletedSkillKey }) {
      queryClient.removeQueries({ queryKey: skillQuery(deletedSkillKey).queryKey, exact: true });
      await Promise.all([
        invalidateKind(queryClient, kind),
        queryClient.invalidateQueries({ queryKey: skillSelectionQueryKey }),
        queryClient.invalidateQueries({ queryKey: skillDefaultQuery(kind).queryKey }),
      ]);
    },
  });
}

export function setSkillDefaultMutationOptions(queryClient: QueryClient, kind: string) {
  return mutationOptions<SkillDefault, Error, string | undefined>({
    ...ipcMutationOptions,
    mutationKey: [...skillDefaultMutationKey, kind],
    scope: skillKindMutationScope(kind),
    mutationFn: (skillKey) =>
      skillIpc.setDefault({
        kind,
        ...(skillKey !== undefined && { skillKey }),
      }),
    onSuccess(selection) {
      queryClient.setQueryData(skillDefaultQuery(kind).queryKey, selection);
      return queryClient.invalidateQueries({ queryKey: skillSelectionQueryKey });
    },
  });
}

export function useSetSkillDefault(kind: string) {
  const queryClient = useQueryClient();
  return useMutation(setSkillDefaultMutationOptions(queryClient, kind));
}

export function useIsSkillDefaultPending(kind: string) {
  return useIsMutating({ mutationKey: [...skillDefaultMutationKey, kind] }) > 0;
}
