import { Schema } from "effect";

export class ReactionError extends Schema.TaggedError<ReactionError>()("ReactionError", {
  message: Schema.String,
}) {}
