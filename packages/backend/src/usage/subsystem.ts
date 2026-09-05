import { Cause, Clock, Context, Effect, FiberSet, Layer, PubSub } from "effect";
import { DatabaseService } from "#backend/database/database";
import { createUsageHistory, type UsageHistory } from "./history";

type UsageSubsystem = UsageHistory &
  Readonly<{
    /** Receives coalesced signals asynchronously; read current state in the listener. */
    subscribe: (listener: () => void | Promise<void>) => () => void;
  }>;

export type Usage = Pick<UsageSubsystem, "getOverview" | "clear" | "subscribe">;

export class UsageService extends Context.Service<UsageService, UsageSubsystem>()(
  "@jaquelene/backend/Usage",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      // These are invalidations, not ledger events: one buffered signal is enough to reread current state.
      const changes = yield* Effect.acquireRelease(PubSub.sliding<void>(1), PubSub.shutdown);
      const runSubscription = yield* FiberSet.makeRuntime();
      const runSync = Effect.runSyncWith(yield* Effect.context());
      const publish = PubSub.publish(changes, undefined);
      const usage = createUsageHistory(yield* DatabaseService, () => {
        runSync(publish);
      });
      usage.attempts.recoverInterrupted(yield* Clock.currentTimeMillis);

      return UsageService.of({
        ...usage,
        subscribe(listener) {
          const fiber = runSubscription(
            Effect.scoped(
              Effect.gen(function* () {
                const subscription = yield* PubSub.subscribe(changes);
                const notify = Effect.promise(() => Promise.resolve(listener())).pipe(
                  Effect.catchDefect((defect) =>
                    Effect.logError("Usage subscriber failed.", Cause.die(defect)),
                  ),
                );
                // Leave the publisher's stack before running subscriber code.
                yield* Effect.forever(
                  PubSub.take(subscription).pipe(
                    Effect.andThen(Effect.yieldNow),
                    Effect.andThen(notify),
                  ),
                );
              }),
            ),
          );

          return () => fiber.interruptUnsafe();
        },
      });
    }),
  );
}
