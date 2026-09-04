import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "#backend/database/database";
import { createUsageHistory, type UsageHistory } from "./history";

export class UsageService extends Context.Service<UsageService, UsageHistory>()(
  "@jaquelene/backend/Usage",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      return UsageService.of(createUsageHistory(yield* DatabaseService));
    }),
  );
}
