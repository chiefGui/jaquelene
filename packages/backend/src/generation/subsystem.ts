import type { Database } from "#backend/database/database";
import type { Models } from "#backend/provider/model-catalog";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import type { ProviderAttempts } from "#backend/usage/provider-attempts";
import { createGenerations, type GenerationEngine } from "./generations";
import type { ReplyPreparer } from "./reply-preparation";
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
  models: Pick<Models, "getModel">;
  providers: ProviderGenerationRouter;
  attempts: ProviderAttempts;
}>;

export function createGenerationSubsystem({
  database,
  replyPreparer,
  models,
  providers,
  attempts,
}: GenerationSubsystemOptions): GenerationSubsystem {
  const engine = createGenerations(database, replyPreparer, models, providers, Date.now, attempts);
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
