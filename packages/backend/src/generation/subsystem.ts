import { Context, Effect, FiberSet, Layer } from "effect";
import { getCampaignUsageAttribution } from "#backend/campaign/usage";
import { DatabaseService } from "#backend/database/database";
import { createModelExecutionRunner, ModelExecutionService } from "#backend/model/execution";
import { ModelInputService } from "#backend/model/input-resolver";
import { ThreadService } from "#backend/thread/subsystem";
import { UsageService } from "#backend/usage/subsystem";
import { createGenerations, type GenerationEngine, type GenerationOptions } from "./generations";
import { createReplyPreparer } from "./reply-preparation";
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

function createGenerationSubsystem(options: GenerationOptions): GenerationSubsystem {
  const engine = createGenerations(options);
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
            getUsageAttribution: (threadId) => getCampaignUsageAttribution(database, threadId),
          }),
        ),
        (generations) => Effect.promise(() => generations.close()),
      );

      return GenerationService.of({ replies: subsystem.replies });
    }),
  );
}
