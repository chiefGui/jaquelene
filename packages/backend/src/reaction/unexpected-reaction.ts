import { skillIdSchema } from "@jaquelene/domain";
import type { ReactionDefinition } from "./skill";

export const unexpectedReaction = {
  descriptor: {
    id: skillIdSchema.parse("unexpected-reaction"),
    name: "Unexpected reaction",
    pendingLabel: "Generating unexpected reaction…",
  },
  history: {
    selection: { kind: "completed-turns", limit: 3, openingScene: "include" },
    contentByteBudget: 32 * 1024,
  },
  instructions: "Write a brief, unexpected but plausible reaction to the latest scene.",
} satisfies ReactionDefinition;
