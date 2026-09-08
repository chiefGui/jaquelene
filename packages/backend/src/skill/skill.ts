import type { SkillDescriptor } from "@jaquelene/domain";
import type { Effect } from "effect";

export type Skill<Input, Result, Failure = unknown> = Readonly<{
  descriptor: SkillDescriptor;
  execute: (input: Input) => Effect.Effect<Result, Failure>;
}>;
