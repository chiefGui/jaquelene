import { Context, Effect, Layer } from "effect";
import { getCampaignUsageAttribution } from "#backend/campaign/usage";
import { DatabaseService } from "#backend/database/database";
import { ModelExecutionService } from "#backend/model/execution";
import { ModelInputService } from "#backend/model/input-resolver";
import { ThreadService } from "#backend/thread/subsystem";
import { UsageService } from "#backend/usage/subsystem";
import { createGenerations, type GenerationEngine } from "./generations";
import { createReplyPreparer } from "./reply-preparation";

export class GenerationService extends Context.Service<GenerationService, GenerationEngine>()(
  "@jaquelene/backend/Generations",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const modelExecutor = yield* ModelExecutionService;
      const modelInputs = yield* ModelInputService;
      const threads = yield* ThreadService;
      const usage = yield* UsageService;
      const generations = createGenerations({
        database,
        replyPreparer: createReplyPreparer(threads.engine, modelInputs),
        modelExecutor,
        attempts: usage.attempts,
        getUsageAttribution: (threadId) => getCampaignUsageAttribution(database, threadId),
      });
      generations.recoverInterrupted();
      return GenerationService.of(generations);
    }),
  );
}
