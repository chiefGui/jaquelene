import { Instructions } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const instructionIpc = {
  listGroups: requireIpcMethod(Instructions?.listGroups),
  createRoleplayInstruction: requireIpcMethod(Instructions?.createRoleplayInstruction),
  updateRoleplayInstruction: requireIpcMethod(Instructions?.updateRoleplayInstruction),
  deleteRoleplayInstruction: requireIpcMethod(Instructions?.deleteRoleplayInstruction),
  getCampaignRoleplayInstructionKey: requireIpcMethod(
    Instructions?.getCampaignRoleplayInstructionKey,
  ),
  setCampaignRoleplayInstructionKey: requireIpcMethod(
    Instructions?.setCampaignRoleplayInstructionKey,
  ),
};
