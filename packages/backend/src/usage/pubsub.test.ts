import { Effect, PubSub } from "effect";
import { describe, expect, it } from "vite-plus/test";

// Guards the pinned Effect patch required by usage's single-slot invalidations.
describe("single-slot usage signals", () => {
  it.each(["single", "batch"])(
    "does not consume another subscriber's signal after sliding (%s)",
    async (mode) => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const changes = yield* PubSub.sliding<number>(1);
            yield* Effect.addFinalizer(() => PubSub.shutdown(changes));
            const slow = yield* PubSub.subscribe(changes);

            yield* Effect.scoped(
              Effect.gen(function* () {
                const fast = yield* PubSub.subscribe(changes);
                yield* PubSub.publish(changes, 1);
                yield* PubSub.publish(changes, 2);

                if (mode === "single") {
                  expect(yield* PubSub.take(fast)).toBe(2);
                } else {
                  expect(yield* PubSub.takeUpTo(fast, 1)).toEqual([2]);
                }
                expect(yield* PubSub.takeUpTo(fast, 1)).toEqual([]);
              }),
            );

            expect(yield* PubSub.takeUpTo(slow, 1)).toEqual([2]);
            yield* PubSub.publish(changes, 3);
            expect(yield* PubSub.takeUpTo(slow, 1)).toEqual([3]);
            expect(yield* PubSub.takeUpTo(slow, 1)).toEqual([]);
          }),
        ),
      );
    },
  );
});
