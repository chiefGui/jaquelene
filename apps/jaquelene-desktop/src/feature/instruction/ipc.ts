import {
  ids,
  type CatalogInstruction,
  type InstructionGroup,
  type Instructions,
} from "@jaquelene/backend";
import {
  InstructionOrigin,
  Instructions as InstructionsIpc,
  type Instruction as IpcInstruction,
  type InstructionGroup as IpcInstructionGroup,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcOrigin(origin: CatalogInstruction["origin"]) {
  switch (origin) {
    case "factory":
      return InstructionOrigin.Factory;
    case "custom":
      return InstructionOrigin.Custom;
  }
}

function toIpcInstruction(instruction: CatalogInstruction): IpcInstruction {
  return {
    key: instruction.key,
    title: instruction.title,
    body: instruction.body,
    origin: toIpcOrigin(instruction.origin),
  };
}

function toIpcGroup(group: InstructionGroup): IpcInstructionGroup {
  return {
    key: group.key,
    name: group.name,
    description: group.description,
    instructions: group.instructions.map(toIpcInstruction),
  };
}

export function exposeInstructions(target: WebFrameMain, instructions: Instructions) {
  InstructionsIpc.for(target).setImplementation({
    listGroups: () => instructions.listGroups().map(toIpcGroup),
    createRoleplayInstruction: (input) => toIpcInstruction(instructions.create(input)),
    updateRoleplayInstruction: ({ key, input }) => {
      const instruction = instructions.update(ids.instruction.parse(key), input);
      return instruction ? toIpcInstruction(instruction) : null;
    },
    deleteRoleplayInstruction: (key) => instructions.delete(ids.instruction.parse(key)),
    getDefaultRoleplayInstructionKey: instructions.getDefaultSelection,
    setDefaultRoleplayInstructionKey: instructions.setDefaultSelection,
    getCampaignRoleplayInstructionKey: (campaignId) =>
      instructions.getCampaignSelection(ids.campaign.parse(campaignId)),
    setCampaignRoleplayInstructionKey: ({ campaignId, instructionKey }) =>
      instructions.setCampaignSelection(ids.campaign.parse(campaignId), instructionKey),
  });
}
