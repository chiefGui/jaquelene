import type {
  Instruction,
  InstructionGroup,
  RoleplayInstructionInput,
  UpdateRoleplayInstructionRequest,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions } from "@/ipc";
import { instructionIpc } from "./ipc";

export const instructionQueryKey = ["instructions"] as const;
const campaignRoleplayInstructionKeyQueryKey = [
  ...instructionQueryKey,
  "campaign-roleplay-key",
] as const;

export const instructionGroupsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: instructionQueryKey,
  queryFn: instructionIpc.listGroups,
});

export function campaignRoleplayInstructionKeyQuery(campaignId: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignRoleplayInstructionKeyQueryKey, campaignId],
    queryFn: () => instructionIpc.getCampaignRoleplayInstructionKey(campaignId),
  });
}

function cacheInstruction(
  groups: InstructionGroup[] | undefined,
  instruction: Instruction,
): InstructionGroup[] | undefined {
  if (!groups) {
    return groups;
  }

  return groups.map((group) => {
    if (group.key !== "roleplay") {
      return group;
    }

    const index = group.instructions.findIndex(({ key }) => key === instruction.key);
    return {
      ...group,
      instructions:
        index === -1
          ? [...group.instructions, instruction]
          : group.instructions.with(index, instruction),
    };
  });
}

export function useCreateRoleplayInstruction() {
  const queryClient = useQueryClient();

  return useMutation<Instruction, Error, RoleplayInstructionInput>({
    ...ipcMutationOptions,
    mutationFn: instructionIpc.createRoleplayInstruction,
    onSuccess(instruction) {
      queryClient.setQueryData<InstructionGroup[]>(instructionGroupsQuery.queryKey, (groups) =>
        cacheInstruction(groups, instruction),
      );
    },
  });
}

export function useUpdateRoleplayInstruction() {
  const queryClient = useQueryClient();

  return useMutation<Instruction, Error, UpdateRoleplayInstructionRequest>({
    ...ipcMutationOptions,
    async mutationFn(request) {
      const instruction = await instructionIpc.updateRoleplayInstruction(request);

      if (!instruction) {
        throw new Error(`Roleplay instruction "${request.key}" is unavailable.`);
      }

      return instruction;
    },
    onSuccess(instruction) {
      queryClient.setQueryData<InstructionGroup[]>(instructionGroupsQuery.queryKey, (groups) =>
        cacheInstruction(groups, instruction),
      );
    },
  });
}

export function useDeleteRoleplayInstruction() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    async mutationFn(key: string) {
      if (!(await instructionIpc.deleteRoleplayInstruction(key))) {
        throw new Error(`Roleplay instruction "${key}" is unavailable.`);
      }

      return key;
    },
    onSuccess(key) {
      queryClient.setQueryData<InstructionGroup[]>(instructionGroupsQuery.queryKey, (groups) =>
        groups?.map((group) => ({
          ...group,
          instructions: group.instructions.filter((instruction) => instruction.key !== key),
        })),
      );
      void queryClient.invalidateQueries({ queryKey: campaignRoleplayInstructionKeyQueryKey });
    },
  });
}

export function useSetCampaignRoleplayInstruction(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation<string, Error, string>({
    ...ipcMutationOptions,
    mutationFn: async (instructionKey) => {
      const savedInstructionKey = await instructionIpc.setCampaignRoleplayInstructionKey({
        campaignId,
        instructionKey,
      });

      if (!savedInstructionKey) {
        throw new Error(`Campaign "${campaignId}" is unavailable.`);
      }

      return savedInstructionKey;
    },
    onSuccess(instructionKey) {
      queryClient.setQueryData(
        campaignRoleplayInstructionKeyQuery(campaignId).queryKey,
        instructionKey,
      );
    },
  });
}

export type { RoleplayInstructionInput };
