import type { CampaignSkillSelection } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignSkillSelectionQueryKey } from "@/feature/cache-keys";
import { ipcMutationOptions, ipcQueryOptions } from "@/ipc";
import { campaignMutationKey, campaignMutationScope } from "./mutation";
import { campaignSkillsIpc } from "./skills-ipc";

export function campaignSkillSelectionQuery(campaignId: string, kind: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...campaignSkillSelectionQueryKey, campaignId, kind],
    queryFn: () => campaignSkillsIpc.getSelection({ campaignId, kind }),
  });
}

export function useSetCampaignSkillSelection(campaignId: string, kind: string) {
  const queryClient = useQueryClient();
  return useMutation<CampaignSkillSelection, Error, string | undefined>({
    ...ipcMutationOptions,
    mutationKey: [...campaignMutationKey(campaignId), "skill", kind],
    scope: campaignMutationScope(campaignId),
    async mutationFn(skillKey) {
      const selection = await campaignSkillsIpc.setSelection({
        campaignId,
        kind,
        ...(skillKey !== undefined && { skillKey }),
      });

      if (!selection) {
        throw new Error(`Campaign "${campaignId}" is unavailable.`);
      }

      return selection;
    },
    onSuccess(selection) {
      queryClient.setQueryData(campaignSkillSelectionQuery(campaignId, kind).queryKey, selection);
    },
  });
}
