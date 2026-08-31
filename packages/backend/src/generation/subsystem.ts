import type { Database } from "#backend/database/database";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { createGenerations, type GenerationEngine, type Generations } from "./generations";
import type { ReplyPreparer } from "./reply-preparation";
import { superviseGenerations } from "./supervisor";

type ReplyGenerations = Pick<
  GenerationEngine,
  "acceptReplyInTransaction" | "listLatestForTurns" | "requireRegisteredModel"
> &
  Pick<ReturnType<typeof superviseGenerations>, "scheduleAcceptedReply">;

type GenerationSubsystem = Readonly<{
  generations: Generations;
  replies: ReplyGenerations;
  close: () => Promise<void>;
}>;

type GenerationSubsystemOptions = Readonly<{
  database: Database;
  replyPreparer: ReplyPreparer;
  providers: ProviderGenerationRouter;
}>;

export function createGenerationSubsystem({
  database,
  replyPreparer,
  providers,
}: GenerationSubsystemOptions): GenerationSubsystem {
  const engine = createGenerations(database, replyPreparer, providers);
  engine.recoverInterrupted();
  const supervised = superviseGenerations(engine);

  return {
    generations: supervised.generations,
    replies: {
      acceptReplyInTransaction: engine.acceptReplyInTransaction,
      listLatestForTurns: engine.listLatestForTurns,
      requireRegisteredModel: engine.requireRegisteredModel,
      scheduleAcceptedReply: supervised.scheduleAcceptedReply,
    },
    close: supervised.close,
  };
}
