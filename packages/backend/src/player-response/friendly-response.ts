import { skillIdSchema } from "@jaquelene/domain";
import type { PlayerResponseDefinition } from "./skill";

export const friendlyResponse = {
  descriptor: {
    id: skillIdSchema.parse("friendly-response"),
    name: "Friendly response",
    pendingLabel: "Generating friendly response…",
  },
  history: {
    selection: { kind: "completed-turns", limit: 3, openingScene: "include" },
    contentByteBudget: 32 * 1024,
  },
  instructions:
    "Write a brief, positive reaction to the latest scene as the player's character. Match their voice. Enclose all dialogue in double quotation marks. Output only the response.",
} satisfies PlayerResponseDefinition;
