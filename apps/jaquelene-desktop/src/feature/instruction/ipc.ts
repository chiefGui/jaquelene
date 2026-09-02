import type { CatalogInstruction, InstructionCatalog, InstructionGroup } from "@jaquelene/backend";
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
  }
}

function toIpcInstruction(instruction: CatalogInstruction): IpcInstruction {
  return {
    key: instruction.key,
    name: instruction.name,
    content: instruction.content,
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

export function exposeInstructions(target: WebFrameMain, instructions: InstructionCatalog) {
  InstructionsIpc.for(target).setImplementation({
    listGroups: () => instructions.listGroups().map(toIpcGroup),
  });
}
