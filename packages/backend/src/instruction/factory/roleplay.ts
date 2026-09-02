import type { CatalogInstruction, InstructionGroup } from "../registry";

export const jaqueleneRoleplayInstruction = Object.freeze({
  key: "factory.roleplay.jaquelene",
  title: "Jaquelene",
  body: "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
  origin: "factory" as const,
}) satisfies CatalogInstruction;

export const roleplayInstructionGroup = Object.freeze({
  key: "roleplay",
  name: "Roleplay",
  description: "Instructions that guide how the AI behaves during roleplay.",
}) satisfies Omit<InstructionGroup, "instructions">;
