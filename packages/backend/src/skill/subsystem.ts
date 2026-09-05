import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "#backend/database/database";
import { createSkills } from "./skills";
import type { SkillKindRegistration, Skills } from "./types";

export class SkillService extends Context.Service<SkillService, Skills>()(
  "@jaquelene/backend/Skills",
) {
  static readonly layer = (
    registrations: readonly SkillKindRegistration[],
    now: () => number = Date.now,
  ) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        return SkillService.of(createSkills(yield* DatabaseService, registrations, now));
      }),
    );
}
