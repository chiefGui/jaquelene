import { Schema } from "effect";

export class PlayerResponseError extends Schema.TaggedError<PlayerResponseError>()(
  "PlayerResponseError",
  {
    message: Schema.String,
  },
) {}
