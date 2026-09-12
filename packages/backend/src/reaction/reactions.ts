import { Effect } from "effect";
import type { SkillId } from "@jaquelene/domain";
import type { ReactionRequest, ReactionSkill } from "./skill";
import { ReactionError } from "./error";

export type ExecuteReaction = ReactionRequest & Readonly<{ skillId: SkillId }>;

export function createReactions(skills: readonly ReactionSkill[]) {
  const registry = new Map<SkillId, ReactionSkill>();
  for (const skill of skills) {
    if (registry.has(skill.descriptor.id)) {
      throw new Error(`Duplicate skill: ${skill.descriptor.id}`);
    }
    registry.set(skill.descriptor.id, skill);
  }
  return {
    list: () => Array.from(registry.values(), ({ descriptor }) => ({ ...descriptor })),
    execute: Effect.fn("Reactions.execute")(function* ({ skillId, ...request }: ExecuteReaction) {
      const skill = registry.get(skillId);
      if (!skill) {
        return yield* new ReactionError({ message: "The reaction skill is unavailable." });
      }
      return yield* skill.execute(request);
    }),
  };
}

export type Reactions = ReturnType<typeof createReactions>;
