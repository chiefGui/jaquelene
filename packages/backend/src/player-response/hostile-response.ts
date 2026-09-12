import { skillIdSchema } from "@jaquelene/domain";
import type { PlayerResponseDefinition } from "./skill";

export const hostileResponse = {
  descriptor: {
    id: skillIdSchema.parse("hostile-response"),
    name: "Hostile response",
    pendingLabel: "Generating hostile response…",
  },
  history: {
    selection: { kind: "completed-turns", limit: 3, openingScene: "include" },
    contentByteBudget: 32 * 1024,
  },
  instructions:
    "Write a brief, hostile reaction to the latest scene as the player's character. Match their voice. Enclose all dialogue in double quotation marks. Output only the response.",
} satisfies PlayerResponseDefinition;
