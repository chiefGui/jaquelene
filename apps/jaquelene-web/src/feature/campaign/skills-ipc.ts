import { CampaignSkills } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const campaignSkillsIpc = {
  getSelection: requireIpcMethod(CampaignSkills?.getSelection),
  setSelection: requireIpcMethod(CampaignSkills?.setSelection),
};
