import { skillIdSchema } from "@jaquelene/domain";
import type { ReactionDefinition } from "./skill";

export const hostileReaction = {
  descriptor: {
    id: skillIdSchema.parse("hostile-reaction"),
    name: "Hostile reaction",
    pendingLabel: "Generating hostile reaction…",
  },
  history: {
    selection: { kind: "completed-turns", limit: 3, openingScene: "include" },
    contentByteBudget: 32 * 1024,
  },
  instructions:
    "Write a brief, hostile reaction to the latest scene. Match the user's established voice and narrative perspective. Use actions or dialogue as appropriate. Enclose dialogue in double quotation marks. Output only the reaction.",
} satisfies ReactionDefinition;
