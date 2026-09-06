import type { Effect } from "effect";
import type { Database } from "#backend/database/database";
import type { ThreadId } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import type { ThreadMessage } from "#backend/thread/schema";
import type { ThreadActivity } from "#backend/thread/threads";

export type GenerationTarget = Readonly<{
  threadId: ThreadId;
  prepare: Effect.Effect<ModelInput, unknown>;
  append(
    transaction: Pick<Database, "insert" | "select" | "update">,
    content: string,
    createdAt: number,
  ): Readonly<{ message: ThreadMessage; threadActivity: ThreadActivity | null }>;
}>;
