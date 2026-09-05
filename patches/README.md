# Dependency patches

## Effect 4.0.0-rc.112

The one-slot sliding PubSub advances a consumer's cursor by one even when it has skipped evicted messages. The consumer can then read the same signal twice, consuming another subscriber's pending signal or releasing it when unsubscribing.

The patch advances the cursor to the current publisher index after both single and batch reads. It changes the TypeScript source and the shipped JavaScript. Usage notifications require this invariant to keep slow subscribers independent without an unbounded backlog.

Remove the patch when upgrading to a release containing the equivalent fix. Verify with `packages/backend/src/usage/pubsub.test.ts` and `packages/backend/src/usage/subsystem.test.ts`.
