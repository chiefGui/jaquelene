import type { CatalogInstruction, InstructionGroup, InstructionSource } from "../registry";

const defaultInstruction = Object.freeze({
  key: "factory.roleplay.default",
  name: "Default",
  content:
    "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
  origin: "factory" as const,
}) satisfies CatalogInstruction;

const group = Object.freeze({
  key: "roleplay",
  name: "Roleplay",
  description: "Instructions that guide how the AI behaves during roleplay.",
  instructions: Object.freeze([defaultInstruction]),
}) satisfies InstructionGroup;

export const factoryRoleplay = Object.freeze({
  listGroups: () => [group],
  resolve: ({ campaign }) => (campaign ? [defaultInstruction] : []),
}) satisfies InstructionSource;
