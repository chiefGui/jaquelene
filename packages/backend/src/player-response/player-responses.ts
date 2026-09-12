import { Effect } from "effect";
import type { SkillId } from "@jaquelene/domain";
import type { PlayerResponseRequest, PlayerResponseSkill } from "./skill";
import { PlayerResponseError } from "./error";

export type ExecutePlayerResponse = PlayerResponseRequest & Readonly<{ skillId: SkillId }>;

export function createPlayerResponses(skills: readonly PlayerResponseSkill[]) {
  const registry = new Map<SkillId, PlayerResponseSkill>();
  for (const skill of skills) {
    if (registry.has(skill.descriptor.id)) {
      throw new Error(`Duplicate skill: ${skill.descriptor.id}`);
    }
    registry.set(skill.descriptor.id, skill);
  }
  return {
    list: () => Array.from(registry.values(), ({ descriptor }) => ({ ...descriptor })),
    execute: Effect.fn("PlayerResponses.execute")(function* ({
      skillId,
      ...request
    }: ExecutePlayerResponse) {
      const skill = registry.get(skillId);
      if (!skill) {
        return yield* new PlayerResponseError({ message: "The response skill is unavailable." });
      }
      return yield* skill.execute(request);
    }),
  };
}

export type PlayerResponses = ReturnType<typeof createPlayerResponses>;
