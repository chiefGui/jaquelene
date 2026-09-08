import { Schema } from "effect";

export class ComposerSkillError extends Schema.TaggedError<ComposerSkillError>()(
  "ComposerSkillError",
  {
    message: Schema.String,
  },
) {}
