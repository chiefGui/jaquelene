import { skillIdSchema } from "@jaquelene/domain";
import type { ReactionDefinition } from "./skill";

export const friendlyReaction = {
  descriptor: {
    id: skillIdSchema.parse("friendly-reaction"),
    name: "Friendly reaction",
    pendingLabel: "Generating friendly reaction…",
  },
  history: {
    selection: { kind: "completed-turns", limit: 3, openingScene: "include" },
    contentByteBudget: 32 * 1024,
  },
  instructions:
    "Write a brief, positive reaction to the latest scene. Match the user's established voice and narrative perspective. Use actions or dialogue as appropriate. Enclose dialogue in double quotation marks. Output only the reaction.",
} satisfies ReactionDefinition;
