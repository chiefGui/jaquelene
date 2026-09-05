import {
  ids,
  type CampaignSkills,
  type CampaignSkillSelection,
  type SetCampaignSkillSelectionInput,
} from "@jaquelene/backend";
import { skillKeySchema, skillKindKeySchema } from "@jaquelene/domain";
import {
  CampaignSkills as CampaignSkillsIpc,
  CampaignSkillSource,
  type CampaignSkillSelection as IpcCampaignSkillSelection,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcCampaignSource(source: CampaignSkillSelection["source"]) {
  switch (source) {
    case "campaign":
      return CampaignSkillSource.Campaign;
    case "default":
      return CampaignSkillSource.Default;
    case "fallback":
      return CampaignSkillSource.Fallback;
    case "none":
      return CampaignSkillSource.None;
  }
}

function toIpcCampaignSelection(
  selection: CampaignSkillSelection | null,
): IpcCampaignSkillSelection | null {
  if (!selection) {
    return null;
  }
  const result: IpcCampaignSkillSelection = {
    campaignId: selection.campaignId,
    kind: selection.kind,
    source: toIpcCampaignSource(selection.source),
  };
  if (selection.selectedSkillKey !== undefined) {
    result.selectedSkillKey = selection.selectedSkillKey;
  }
  if (selection.effectiveSkillKey !== null) {
    result.effectiveSkillKey = selection.effectiveSkillKey;
  }
  return result;
}

export function exposeCampaignSkills(target: WebFrameMain, skills: CampaignSkills) {
  CampaignSkillsIpc.for(target).setImplementation({
    getSelection: ({ campaignId, kind }) => {
      const selection = skills.getSelection(
        ids.campaign.parse(campaignId),
        skillKindKeySchema.parse(kind),
      );
      return toIpcCampaignSelection(selection);
    },
    setSelection: ({ campaignId, kind, skillKey }) => {
      const input: SetCampaignSkillSelectionInput = {
        campaignId: ids.campaign.parse(campaignId),
        kind: skillKindKeySchema.parse(kind),
        ...(skillKey !== undefined && { skillKey: skillKeySchema.parse(skillKey) }),
      };
      return toIpcCampaignSelection(skills.setSelection(input));
    },
  });
}
