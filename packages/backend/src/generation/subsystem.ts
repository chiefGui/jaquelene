import type { Database } from "#backend/database/database";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { createGenerations, type GenerationEngine, type Generations } from "./generations";
import type { GenerationPromptCompiler } from "./prompt";
import { superviseGenerations } from "./supervisor";

type ReplyGenerations = Pick<
  GenerationEngine,
  "executeReply" | "listLatestForTurns" | "requireRegisteredModel"
>;

type GenerationSubsystem = Readonly<{
  generations: Generations;
  replies: ReplyGenerations;
  close: () => Promise<void>;
}>;

type GenerationSubsystemOptions = Readonly<{
  database: Database;
  promptCompiler: GenerationPromptCompiler;
  providers: ProviderGenerationRouter;
}>;

export function createGenerationSubsystem({
  database,
  promptCompiler,
  providers,
}: GenerationSubsystemOptions): GenerationSubsystem {
  const engine = createGenerations(database, promptCompiler, providers);
  engine.recoverInterrupted();
  const supervised = superviseGenerations(engine);

  return {
    generations: supervised.generations,
    replies: {
      executeReply: supervised.executeReply,
      listLatestForTurns: engine.listLatestForTurns,
      requireRegisteredModel: engine.requireRegisteredModel,
    },
    close: supervised.close,
  };
}
