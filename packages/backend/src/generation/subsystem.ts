import { Context, Effect, FiberSet, Layer } from "effect";
import { DatabaseService, type Database } from "#backend/database/database";
import {
  createModelExecutionRunner,
  ModelExecutionService,
  type ModelExecutionRunner,
} from "#backend/model/execution";
import { ModelInputService } from "#backend/model/input-resolver";
import { ThreadService } from "#backend/thread/subsystem";
import type { ProviderAttempts } from "#backend/usage/provider-attempts";
import { UsageService } from "#backend/usage/subsystem";
import { createGenerations, type GenerationEngine } from "./generations";
import { createReplyPreparer, type ReplyPreparer } from "./reply-preparation";
import { superviseGenerations } from "./supervisor";

type ReplyGenerations = Pick<
  GenerationEngine,
  | "acceptRegenerationInTransaction"
  | "acceptReplyInTransaction"
  | "listLatestForTurns"
  | "resolveConfiguration"
> &
  Pick<ReturnType<typeof superviseGenerations>, "scheduleAcceptedReply">;

type GenerationSubsystem = Readonly<{
  replies: ReplyGenerations;
  close: () => Promise<void>;
}>;

type GenerationSubsystemOptions = Readonly<{
  database: Database;
  replyPreparer: ReplyPreparer;
  modelExecutor: ModelExecutionRunner;
  attempts: ProviderAttempts;
}>;

function createGenerationSubsystem({
  database,
  replyPreparer,
  modelExecutor,
  attempts,
}: GenerationSubsystemOptions): GenerationSubsystem {
  const engine = createGenerations(database, replyPreparer, modelExecutor, Date.now, attempts);
  engine.recoverInterrupted();
  const supervised = superviseGenerations(engine);

  return {
    replies: {
      acceptRegenerationInTransaction: engine.acceptRegenerationInTransaction,
      acceptReplyInTransaction: engine.acceptReplyInTransaction,
      listLatestForTurns: engine.listLatestForTurns,
      resolveConfiguration: engine.resolveConfiguration,
      scheduleAcceptedReply: supervised.scheduleAcceptedReply,
    },
    close: supervised.close,
  };
}

export class GenerationService extends Context.Service<
  GenerationService,
  Omit<GenerationSubsystem, "close">
>()("@jaquelene/backend/Generations") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const modelExecutions = yield* ModelExecutionService;
      const modelInputs = yield* ModelInputService;
      const threads = yield* ThreadService;
      const usage = yield* UsageService;
      const runModelEffect = yield* FiberSet.makeRuntimePromise();
      const modelExecutor = createModelExecutionRunner(modelExecutions, runModelEffect);
      const subsystem = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createGenerationSubsystem({
            database,
            replyPreparer: createReplyPreparer(threads.engine, modelInputs),
            modelExecutor,
            attempts: usage.attempts,
          }),
        ),
        (generations) => Effect.promise(() => generations.close()),
      );

      return GenerationService.of({ replies: subsystem.replies });
    }),
  );
}
