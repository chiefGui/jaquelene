import { Context, Effect, Layer } from "effect";
import { DatabaseService, type Database } from "#backend/database/database";
import type { ThreadId } from "#backend/id";
import { ModelInputService, type ModelInputResolver } from "#backend/model/input-resolver";
import type { ThreadTranscript } from "@jaquelene/domain";
import { createThreads, type ThreadEngine } from "./threads";
import { createThreadTranscriptReader } from "./transcript";

export type Threads = Pick<ThreadEngine, "create" | "get" | "listMessages"> &
  Readonly<{
    getTranscript(threadId: ThreadId): ThreadTranscript;
  }>;

function createThreadSubsystem(
  database: Database,
  modelInputs: ModelInputResolver,
  now: () => number = Date.now,
) {
  const engine = createThreads(database, now);
  const transcripts = createThreadTranscriptReader(engine, modelInputs);
  const threads: Threads = {
    create: engine.create,
    get: engine.get,
    listMessages: engine.listMessages,
    getTranscript: transcripts.get,
  };

  return { engine, threads };
}

type ThreadSubsystem = ReturnType<typeof createThreadSubsystem>;

export class ThreadService extends Context.Service<ThreadService, ThreadSubsystem>()(
  "@jaquelene/backend/Threads",
) {
  static readonly layer = (now: () => number = Date.now) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const database = yield* DatabaseService;
        const modelInputs = yield* ModelInputService;
        return ThreadService.of(createThreadSubsystem(database, modelInputs, now));
      }),
    );
}
