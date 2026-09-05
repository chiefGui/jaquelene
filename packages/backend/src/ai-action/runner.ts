import {
  aiActionInputSchema,
  aiActionTextResultSchema,
  type AiActionDescriptor,
  type AiActionInput,
} from "@jaquelene/domain";
import { Cause, Clock, Context, Effect, Exit, Layer, Schema } from "effect";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import { InferenceService, type Inference } from "#backend/model/inference";
import { requireModelInput } from "#backend/model/input";
import type { ProviderAttempts } from "#backend/usage/provider-attempts";
import { UsageService } from "#backend/usage/subsystem";
import type { AiActionDefinition, AiActionSet } from "./definition";

const identitySchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
  Schema.isTrimmed(),
);
const descriptorSchema = Schema.Struct({
  id: identitySchema,
  label: identitySchema,
  requiresText: Schema.Boolean,
});
const decodeDescriptor = Schema.decodeUnknownSync(descriptorSchema);
const decodeIdentity = Schema.decodeUnknownSync(identitySchema);

export class AiActionError extends Schema.TaggedError<AiActionError>()("AiActionError", {
  kind: Schema.Literals([
    "input",
    "configuration",
    "provider",
    "timeout",
    "output",
    "accounting",
    "storage",
  ]),
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export type RunAiActionRequest = AiActionInput &
  Readonly<{
    configuration: RequestedModelConfiguration;
  }>;

export type AiActionRunner = Readonly<{
  list: (target: string) => readonly AiActionDescriptor[];
  run: (request: RunAiActionRequest) => Effect.Effect<string, AiActionError>;
}>;

function indexActions(sets: readonly AiActionSet[]) {
  const targets = new Map<string, ReadonlyMap<string, AiActionDefinition>>();
  for (const set of sets) {
    const target = decodeIdentity(set.target);
    if (targets.has(target)) {
      throw new TypeError(`Duplicate AI action target "${target}".`);
    }
    const actions = new Map<string, AiActionDefinition>();
    for (const definition of set.actions) {
      const descriptor = decodeDescriptor(definition);
      if (actions.has(descriptor.id)) {
        throw new TypeError(`Duplicate AI action "${descriptor.id}" for "${target}".`);
      }
      actions.set(descriptor.id, {
        ...descriptor,
        prepare: definition.prepare,
        parseResult: definition.parseResult,
      });
    }
    targets.set(target, actions);
  }
  return targets;
}

export function createAiActionRunner(
  sets: readonly AiActionSet[],
  inference: Inference,
  attempts: Pick<ProviderAttempts, "start" | "settle">,
): AiActionRunner {
  const targets = indexActions(sets);
  const storageError = (cause: unknown) =>
    new AiActionError({
      kind: "storage",
      message: "Could not record AI action usage.",
      cause,
    });
  const run = Effect.fn("AiActionRunner.run")(function* (request: RunAiActionRequest) {
    const { configuration: requestedConfiguration, ...payload } = request;
    const input = yield* Effect.try({
      try: () => aiActionInputSchema.parse(payload),
      catch: (cause) =>
        new AiActionError({
          kind: "input",
          message: "The AI action input is invalid.",
          cause,
        }),
    });
    const definition = targets.get(input.target)?.get(input.actionId);
    if (!definition) {
      return yield* new AiActionError({
        kind: "input",
        message: "This AI action is not available for this field.",
        cause: undefined,
      });
    }
    if (definition.requiresText && !input.text.trim()) {
      return yield* new AiActionError({
        kind: "input",
        message: "Write some text before using this action.",
        cause: undefined,
      });
    }
    const prepared = yield* Effect.try({
      try: () => requireModelInput(definition.prepare(input.text)),
      catch: (cause) =>
        new AiActionError({
          kind: "input",
          message: "Could not prepare this AI action.",
          cause,
        }),
    });
    const configuration = yield* inference.resolveConfiguration(requestedConfiguration).pipe(
      Effect.mapError(
        (cause) =>
          new AiActionError({
            kind: "configuration",
            message: "Check the AI action model and provider settings.",
            cause,
          }),
      ),
      Effect.timeoutOrElse({
        duration: "2 minutes",
        orElse: () =>
          new AiActionError({
            kind: "timeout",
            message: "Loading the model took too long. Try again.",
            cause: undefined,
          }),
      }),
    );
    const result = yield* Effect.acquireUseRelease(
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((startedAt) =>
          Effect.try({
            try: () =>
              attempts.start({
                executionId: input.executionId,
                attribution: {
                  kind: "ai-action",
                  id: `${encodeURIComponent(input.target)}/${encodeURIComponent(input.actionId)}`,
                },
                providerId: configuration.model.providerId,
                requestedModelId: configuration.model.modelId,
                startedAt,
              }),
            catch: storageError,
          }),
        ),
      ),
      () =>
        inference.execute({ executionId: input.executionId, configuration, input: prepared }).pipe(
          Effect.mapError(
            (cause) =>
              new AiActionError({
                kind: "provider",
                message: "The model request failed. Check your provider and try again.",
                cause,
              }),
          ),
          Effect.timeoutOrElse({
            duration: "2 minutes",
            orElse: () =>
              new AiActionError({
                kind: "timeout",
                message: "The model took too long. Try again.",
                cause: undefined,
              }),
          }),
        ),
      (attempt, exit) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            Effect.try({
              try: () => {
                const finishedAt = Math.max(attempt.startedAt, now);
                if (Exit.isSuccess(exit)) {
                  attempts.settle(attempt.id, {
                    status: "completed",
                    finishedAt,
                    accounting: exit.value.accounting,
                  });
                  return;
                }
                let failureKind: "provider" | "interrupted" = "provider";
                if (Cause.hasInterrupts(exit.cause)) {
                  failureKind = "interrupted";
                }
                attempts.settle(attempt.id, { status: "failed", failureKind, finishedAt });
              },
              catch: storageError,
            }),
          ),
        ),
    );
    if (result.outcome === "invalid-accounting") {
      return yield* new AiActionError({
        kind: "accounting",
        message: "The provider returned invalid usage information.",
        cause: result.cause,
      });
    }
    return yield* Effect.try({
      try: () => aiActionTextResultSchema.parse(definition.parseResult(result.text)),
      catch: (cause) =>
        new AiActionError({
          kind: "output",
          message: "The model returned unusable text. Try again.",
          cause,
        }),
    });
  });
  return {
    list(target) {
      return [...(targets.get(target)?.values() ?? [])].map(({ id, label, requiresText }) => ({
        id,
        label,
        requiresText,
      }));
    },
    run,
  };
}

export class AiActionRunnerService extends Context.Service<AiActionRunnerService, AiActionRunner>()(
  "@jaquelene/backend/AiActionRunner",
) {
  static readonly layer = (sets: readonly AiActionSet[]) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const inference = yield* InferenceService;
        const usage = yield* UsageService;
        return yield* Effect.try({
          try: () =>
            AiActionRunnerService.of(createAiActionRunner(sets, inference, usage.attempts)),
          catch: (cause) =>
            new AiActionError({
              kind: "configuration",
              message: "Could not configure AI actions.",
              cause,
            }),
        });
      }),
    );
}
