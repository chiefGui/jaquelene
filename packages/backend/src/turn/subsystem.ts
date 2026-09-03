import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "#backend/database/database";
import { GenerationService } from "#backend/generation/subsystem";
import { ThreadService } from "#backend/thread/subsystem";
import { createTurns, type Turns } from "./turns";

export class TurnService extends Context.Service<TurnService, Turns>()("@jaquelene/backend/Turns") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const generations = yield* GenerationService;
      const threads = yield* ThreadService;
      return createTurns(database, threads.engine, generations.replies);
    }),
  );
}
