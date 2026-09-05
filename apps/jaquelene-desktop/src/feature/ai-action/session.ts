import { AiActionError, type AiActionRunner } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import { aiActionInputSchema, type AiActionInput, type AiActionResult } from "@jaquelene/domain";
import { Cause, Effect } from "effect";
import type { AiActionPreferences } from "./preferences";

export type AiActionEffectRunner = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
  options?: { signal?: AbortSignal },
) => Promise<Success>;

const maxConcurrentActions = 4;

export function createAiActionSession(
  runner: AiActionRunner,
  preferences: Pick<AiActionPreferences, "getModel">,
  runEffect: AiActionEffectRunner,
  diagnostics: ErrorReporter,
) {
  const running = new Map<
    string,
    { controller: AbortController; result: Promise<AiActionResult> }
  >();
  let closed = false;

  async function cancelAll() {
    const results: Promise<AiActionResult>[] = [];
    for (const operation of running.values()) {
      operation.controller.abort();
      results.push(operation.result);
    }
    await Promise.all(results);
  }

  function failed(error: unknown): Extract<AiActionResult, { status: "failed" }> {
    diagnostics.report({ severity: ErrorSeverity.Error, operation: "ai-action.run", error });
    if (error instanceof AiActionError) {
      return { status: "failed", message: error.message };
    }
    return { status: "failed", message: "The AI action could not finish. Try again." };
  }

  return {
    async run(request: AiActionInput): Promise<AiActionResult> {
      const input = aiActionInputSchema.parse(request);
      if (closed) {
        return { status: "failed", message: "This editor session has closed." };
      }
      if (running.has(input.executionId)) {
        return { status: "failed", message: "This AI action is already running." };
      }
      if (running.size >= maxConcurrentActions) {
        return {
          status: "failed",
          message: "Wait for another AI action to finish, then try again.",
        };
      }
      const model = preferences.getModel();
      if (!model) {
        return {
          status: "failed",
          message: "Choose a model for AI actions in Settings > General.",
        };
      }
      const controller = new AbortController();
      let failure: ReturnType<typeof failed> | undefined;
      const execution = runner
        .run({
          ...input,
          configuration: { model: { providerId: model.providerId, modelId: model.modelId } },
        })
        .pipe(
          // Preserve cleanup failures before the Promise runner collapses Effect's cause.
          Effect.onError((cause) =>
            Effect.sync(() => {
              if (Cause.hasInterruptsOnly(cause)) {
                return;
              }
              if (cause.reasons.length === 1) {
                failure = failed(Cause.squash(cause));
                return;
              }
              failure = failed(
                new AggregateError(Cause.prettyErrors(cause), "The AI action failed."),
              );
            }),
          ),
        );
      const result = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return runEffect(execution, { signal: controller.signal });
        })
        .then(
          (text): AiActionResult => {
            if (controller.signal.aborted) {
              return { status: "cancelled" };
            }
            return { status: "completed", text };
          },
          (cause: unknown): AiActionResult => {
            if (failure) {
              return failure;
            }
            if (controller.signal.aborted) {
              return { status: "cancelled" };
            }
            return failed(cause);
          },
        )
        .finally(() => running.delete(input.executionId));
      running.set(input.executionId, { controller, result });
      return result;
    },
    async cancel(executionId: string) {
      const operation = running.get(executionId);
      if (!operation) {
        return;
      }
      operation.controller.abort();
      await operation.result;
    },
    cancelAll,
    close() {
      closed = true;
      return cancelAll();
    },
  };
}
