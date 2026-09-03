import type { Database } from "#backend/database/database";
import type { ThreadId } from "#backend/id";
import type { ModelInputComposer } from "#backend/model/input-composer";
import type { ThreadTranscript } from "@jaquelene/domain";
import { createThreads, type ThreadEngine } from "./threads";
import { createThreadTranscriptReader } from "./transcript";

export type Threads = Pick<ThreadEngine, "create" | "get" | "listMessages"> &
  Readonly<{
    getTranscript(threadId: ThreadId): ThreadTranscript;
  }>;

export function createThreadSubsystem(
  database: Database,
  modelInputs: ModelInputComposer,
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
