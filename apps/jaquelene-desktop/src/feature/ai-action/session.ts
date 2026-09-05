import type { AiActionRunner } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import {
  aiActionInputSchema,
  aiActionResultSchema,
  type AiActionInput,
  type AiActionResult,
} from "@jaquelene/domain";
import { Effect } from "effect";
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

  function cancelAll() {
    for (const operation of running.values()) {
      operation.controller.abort();
    }
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
      const execution = runner
        .run({
          ...input,
          configuration: { model: { providerId: model.providerId, modelId: model.modelId } },
        })
        .pipe(
          Effect.map((text): AiActionResult =>
            aiActionResultSchema.parse({ status: "completed", text }),
          ),
          Effect.catchTag("AiActionError", (error) => {
            if (error.kind !== "input" && error.kind !== "configuration") {
              diagnostics.report({
                severity: ErrorSeverity.Error,
                operation: "ai-action.run",
                error,
              });
            }
            return Effect.succeed<AiActionResult>({ status: "failed", message: error.message });
          }),
        );
      const result = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted();
          return runEffect(execution, { signal: controller.signal });
        })
        .then(
          (outcome): AiActionResult => {
            if (controller.signal.aborted) {
              return { status: "cancelled" };
            }
            return outcome;
          },
          (cause: unknown): AiActionResult => {
            if (controller.signal.aborted) {
              return { status: "cancelled" };
            }
            diagnostics.report({
              severity: ErrorSeverity.Error,
              operation: "ai-action.run",
              error: cause,
            });
            return { status: "failed", message: "The AI action could not finish. Try again." };
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
      cancelAll();
    },
  };
}
