import { Cause, Clock, Effect, Exit } from "effect";
import type { ProviderAttempts, ProviderAttemptSettlement } from "#backend/usage/provider-attempts";
import type { UsageAttribution } from "#backend/usage/types";
import {
  requireModelExecutionRequest,
  type ModelExecutor,
  type ModelExecutionRequest,
} from "./execution";

export function createAccountedModelExecution(
  executor: Pick<ModelExecutor, "execute">,
  attempts: Pick<ProviderAttempts, "start" | "settle">,
) {
  return Effect.fn("AccountedModelExecution.execute")(function* (
    request: ModelExecutionRequest,
    attribution: UsageAttribution,
  ) {
    const prepared = yield* Effect.try({
      try: () => requireModelExecutionRequest(request),
      catch: (cause) => cause,
    });
    return yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis;
        const attempt = yield* Effect.try({
          try: () =>
            attempts.start({
              executionId: prepared.executionId,
              attribution,
              providerId: prepared.configuration.model.providerId,
              requestedModelId: prepared.configuration.model.modelId,
              startedAt,
            }),
          catch: (cause) => cause,
        });
        const executed = yield* Effect.exit(Effect.interruptible(executor.execute(prepared)));
        const finishedAt = Math.max(startedAt, yield* Clock.currentTimeMillis);
        let settlement: ProviderAttemptSettlement;
        if (Exit.isSuccess(executed)) {
          settlement = { status: "completed", finishedAt, accounting: executed.value.accounting };
        } else {
          let failureKind: "provider" | "interrupted" = "provider";
          if (Cause.hasInterrupts(executed.cause)) failureKind = "interrupted";
          settlement = { status: "failed", failureKind, finishedAt };
        }
        const settled = yield* Effect.exit(
          Effect.try({
            try: () => attempts.settle(attempt.id, settlement),
            catch: (cause) => cause,
          }),
        );
        if (Exit.isFailure(settled)) {
          if (Exit.isFailure(executed)) {
            return yield* Effect.fail(
              new AggregateError(
                [executed.cause, settled.cause],
                "Model execution and usage settlement failed.",
              ),
            );
          }
          return yield* Effect.failCause(settled.cause);
        }
        if (Exit.isFailure(executed)) return yield* Effect.failCause(executed.cause);
        if (executed.value.outcome === "invalid-accounting") {
          return yield* Effect.fail(executed.value.cause);
        }
        return executed.value.text;
      }),
    );
  });
}

export type AccountedModelExecution = ReturnType<typeof createAccountedModelExecution>;
