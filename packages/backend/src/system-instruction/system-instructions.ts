import type { ResolvedInstruction } from "#backend/model/input";

export type SystemInstruction = Readonly<{
  key: string;
  name: string;
  content: string;
}>;

export type SystemInstructionCatalogEntry = SystemInstruction &
  Readonly<{
    origin: "factory";
  }>;

export type SystemInstructionGroup = Readonly<{
  key: string;
  name: string;
  description: string;
  instructions: readonly SystemInstructionCatalogEntry[];
}>;

export const factoryDefaultRoleplaySystemInstruction = Object.freeze({
  key: "factory.roleplay.default",
  name: "Default",
  content:
    "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
  origin: "factory" as const,
}) satisfies SystemInstructionCatalogEntry;

function copyInstruction(
  instruction: SystemInstructionCatalogEntry,
): SystemInstructionCatalogEntry {
  return { ...instruction };
}

export function resolveSystemInstruction(instruction: SystemInstruction): ResolvedInstruction {
  return {
    sourceKey: instruction.key,
    content: instruction.content,
  };
}

export function createSystemInstructions() {
  return {
    listGroups(): readonly SystemInstructionGroup[] {
      return [
        {
          key: "roleplay",
          name: "Roleplay",
          description: "Instructions that guide how the AI behaves during roleplay.",
          instructions: [copyInstruction(factoryDefaultRoleplaySystemInstruction)],
        },
      ];
    },
  };
}

export type SystemInstructions = ReturnType<typeof createSystemInstructions>;
