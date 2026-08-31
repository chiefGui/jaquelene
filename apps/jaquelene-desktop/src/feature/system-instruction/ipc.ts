import type {
  SystemInstructionCatalogEntry,
  SystemInstructionGroup,
  SystemInstructions,
} from "@jaquelene/backend";
import {
  SystemInstructionOrigin,
  SystemInstructions as SystemInstructionsIpc,
  type SystemInstruction as IpcSystemInstruction,
  type SystemInstructionGroup as IpcSystemInstructionGroup,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcOrigin(origin: SystemInstructionCatalogEntry["origin"]) {
  switch (origin) {
    case "factory":
      return SystemInstructionOrigin.Factory;
  }
}

function toIpcInstruction(instruction: SystemInstructionCatalogEntry): IpcSystemInstruction {
  return {
    key: instruction.key,
    name: instruction.name,
    content: instruction.content,
    origin: toIpcOrigin(instruction.origin),
  };
}

function toIpcGroup(group: SystemInstructionGroup): IpcSystemInstructionGroup {
  return {
    key: group.key,
    name: group.name,
    description: group.description,
    instructions: group.instructions.map(toIpcInstruction),
  };
}

export function exposeSystemInstructions(
  target: WebFrameMain,
  systemInstructions: SystemInstructions,
) {
  SystemInstructionsIpc.for(target).setImplementation({
    listGroups: () => systemInstructions.listGroups().map(toIpcGroup),
  });
}
