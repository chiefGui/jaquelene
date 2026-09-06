import { Cause, Effect, Exit } from "effect";
import { and, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { parseRegenerationInstructions } from "@jaquelene/domain";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "#backend/database/database";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import { requireThreadMessageContent, type ThreadActivity } from "#backend/thread/threads";
import {
  threadMessageTable,
  threadTable,
  turnTable,
  type ThreadMessage,
} from "#backend/thread/schema";
import { ids, type MessageId, type ThreadId, type TurnId } from "#backend/id";
import {
  requireModelExecutionRequest,
  requireResolvedModelConfiguration,
  type ModelExecutor,
  type ResolvedModelConfiguration,
} from "#backend/model/execution";
import type { ProviderAccounting } from "#backend/provider/accounting";
import {
  settleProviderAttemptInTransaction,
  type ProviderAttempts,
  type StartProviderAttempt,
} from "#backend/usage/provider-attempts";
import type { ProviderAttempt } from "#backend/usage/schema";
import type { UsageAttribution } from "#backend/usage/types";
import type { ReplyAnchor, ReplyPreparer } from "./reply-preparation";
import { createReplyTarget } from "./reply-target";
import type { GenerationTarget } from "./target";
import {
  generationTable,
  toGeneration,
  type Generation,
  type GenerationFailureKind,
  type GenerationIntent,
  type StoredGeneration,
} from "./schema";

export type GenerateReplyRequest = {
  turnId: TurnId;
  intent: GenerationIntent;
  configuration: RequestedModelConfiguration;
};

export type GenerationExecution =
  | {
      outcome: "completed";
      generation: Generation;
      message: ThreadMessage;
      threadActivity: ThreadActivity | null;
    }
  | {
      outcome: "failed";
      generation: Generation;
      cause: unknown;
    };

export type AcceptedGeneration = Readonly<{
  generation: Generation;
  target: GenerationTarget;
  threadActivity: ThreadActivity;
}>;

type GuidedRegeneration = Readonly<{
  sourceMessageId: MessageId;
  content: string;
  instructions: string;
}>;

export type GenerationOptions = Readonly<{
  database: Database;
  replyPreparer: ReplyPreparer;
  modelExecutor: ModelExecutor;
  attempts: Pick<ProviderAttempts, "start" | "changed">;
  getUsageAttribution: (threadId: ThreadId) => UsageAttribution | undefined;
  now?: () => number;
}>;

function modelConfigurationFromGeneration(
  generation: Pick<Generation, "modelId" | "providerId" | "reasoning">,
): ResolvedModelConfiguration {
  const model = {
    providerId: generation.providerId,
    modelId: generation.modelId,
  };

  if (generation.reasoning === undefined) {
    return { model };
  }

  return { model, reasoning: generation.reasoning };
}

export function createGenerations({
  database,
  replyPreparer,
  modelExecutor,
  attempts,
  getUsageAttribution,
  now = Date.now,
}: GenerationOptions) {
  function finishedAt(generation: Pick<Generation, "startedAt">, attempt?: ProviderAttempt) {
    return Math.max(generation.startedAt, attempt?.startedAt ?? 0, now());
  }

  function requireReplyContext(source: Pick<Database, "select">, turnId: TurnId) {
    const input = source
      .select({
        threadId: turnTable.threadId,
        inputMessageId: threadMessageTable.id,
        activeMessageId: threadTable.activeMessageId,
        lastActivityAt: threadTable.lastActivityAt,
        turnCount: threadTable.turnCount,
      })
      .from(turnTable)
      .innerJoin(threadTable, eq(threadTable.id, turnTable.threadId))
      .leftJoin(
        threadMessageTable,
        and(eq(threadMessageTable.turnId, turnTable.id), eq(threadMessageTable.author, "user")),
      )
      .where(eq(turnTable.id, turnId))
      .get();

    if (!input) {
      throw new RangeError(`Turn "${turnId}" does not exist.`);
    }

    if (!input.inputMessageId) {
      throw new Error(`Turn "${turnId}" has no user message.`);
    }

    return {
      anchor: {
        turnId,
        threadId: input.threadId,
        inputMessageId: input.inputMessageId,
      } satisfies ReplyAnchor,
      activeMessageId: input.activeMessageId,
      activity: {
        threadId: input.threadId,
        lastActivityAt: input.lastActivityAt,
        turnCount: input.turnCount,
      },
    };
  }

  function recordFailure(
    generation: Pick<Generation, "id" | "startedAt">,
    failureKind: GenerationFailureKind,
    cause: unknown,
    attempt?: ProviderAttempt,
    accounting?: ProviderAccounting,
  ): GenerationExecution {
    let failedGeneration: StoredGeneration;

    try {
      failedGeneration = database.transaction((transaction) => {
        const completionTime = finishedAt(generation, attempt);
        const storedGeneration = transaction
          .update(generationTable)
          .set({
            status: "failed",
            failureKind,
            finishedAt: completionTime,
          })
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
          .returning()
          .get();

        if (!storedGeneration) {
          throw new Error(`Generation "${generation.id}" is no longer pending.`);
        }

        if (attempt) {
          if (failureKind === "preparation") {
            throw new TypeError("A preparation failure cannot own a provider attempt.");
          }

          let attemptSettlement;

          if (accounting) {
            attemptSettlement = {
              status: "completed",
              finishedAt: completionTime,
              accounting,
            } as const;
          } else if (failureKind === "provider" || failureKind === "interrupted") {
            attemptSettlement = {
              status: "failed",
              failureKind,
              finishedAt: completionTime,
            } as const;
          } else {
            throw new TypeError(
              `Generation failure "${failureKind}" requires provider accounting.`,
            );
          }
          settleProviderAttemptInTransaction(transaction, attempt.id, attemptSettlement);
        }

        return storedGeneration;
      });
    } catch (failure) {
      throw new AggregateError(
        [cause, failure],
        `Could not record the failure of generation "${generation.id}".`,
      );
    }

    if (attempt) {
      attempts.changed();
    }

    return { outcome: "failed", generation: toGeneration(failedGeneration), cause };
  }

  function listLatestForTurns(turnIds: readonly TurnId[]) {
    const uniqueTurnIds = [...new Set(turnIds)];

    if (uniqueTurnIds.length === 0) {
      return [];
    }

    const newerGeneration = alias(generationTable, "newer_generation");
    const storedGenerations = database
      .select()
      .from(generationTable)
      .where(
        and(
          inArray(generationTable.turnId, uniqueTurnIds),
          notExists(
            database
              .select({ id: newerGeneration.id })
              .from(newerGeneration)
              .where(
                and(
                  eq(newerGeneration.turnId, generationTable.turnId),
                  or(
                    gt(newerGeneration.startedAt, generationTable.startedAt),
                    and(
                      eq(newerGeneration.startedAt, generationTable.startedAt),
                      gt(newerGeneration.id, generationTable.id),
                    ),
                  ),
                ),
              ),
          ),
        ),
      )
      .all();
    const generationByTurn = new Map(
      storedGenerations.map((storedGeneration) => {
        const generation = toGeneration(storedGeneration);
        return [generation.turnId, generation];
      }),
    );

    return uniqueTurnIds.flatMap((turnId) => {
      const generation = generationByTurn.get(turnId);

      if (!generation) {
        return [];
      }

      return [generation];
    });
  }

  function acceptReplyInTransaction(
    transaction: Pick<Database, "insert" | "select">,
    turnId: TurnId,
    intent: GenerationIntent,
    requestedConfiguration: ResolvedModelConfiguration,
  ): AcceptedGeneration {
    const replyContext = requireReplyContext(transaction, turnId);

    return acceptReplyForContext(transaction, intent, requestedConfiguration, replyContext);
  }

  function acceptRegenerationInTransaction(
    transaction: Pick<Database, "insert" | "select">,
    assistantMessageId: MessageId,
    requestedConfiguration: ResolvedModelConfiguration,
    requestedInstructions?: string,
  ): AcceptedGeneration {
    const instructions = parseRegenerationInstructions(requestedInstructions);
    const source = transaction
      .select({
        author: threadMessageTable.author,
        content: threadMessageTable.content,
        turnId: threadMessageTable.turnId,
      })
      .from(threadMessageTable)
      .where(eq(threadMessageTable.id, assistantMessageId))
      .get();

    if (!source) {
      throw new RangeError(`Message "${assistantMessageId}" does not exist.`);
    }

    if (source.author !== "assistant") {
      throw new TypeError(`Message "${assistantMessageId}" is not an assistant message.`);
    }

    const replyContext = requireReplyContext(transaction, source.turnId);

    if (replyContext.activeMessageId !== assistantMessageId) {
      throw new RangeError(`Message "${assistantMessageId}" is not the active thread reply.`);
    }

    let regeneration: GuidedRegeneration | undefined;
    if (instructions !== undefined) {
      regeneration = { sourceMessageId: assistantMessageId, content: source.content, instructions };
    }

    return acceptReplyForContext(
      transaction,
      "regeneration",
      requestedConfiguration,
      replyContext,
      regeneration,
    );
  }

  function acceptReplyForContext(
    transaction: Pick<Database, "insert" | "select">,
    intent: GenerationIntent,
    requestedConfiguration: ResolvedModelConfiguration,
    replyContext: ReturnType<typeof requireReplyContext>,
    regeneration?: GuidedRegeneration,
  ): AcceptedGeneration {
    const { turnId } = replyContext.anchor;
    const configuration = requireResolvedModelConfiguration(requestedConfiguration);

    const pendingGeneration = transaction
      .select({ id: generationTable.id })
      .from(generationTable)
      .where(and(eq(generationTable.turnId, turnId), eq(generationTable.status, "pending")))
      .get();

    if (pendingGeneration) {
      throw new RangeError(`Turn "${turnId}" already has a pending generation.`);
    }

    const storedGeneration = transaction
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId,
        intent,
        providerId: configuration.model.providerId,
        modelId: configuration.model.modelId,
        reasoningPreset: configuration.reasoning?.preset ?? null,
        reasoningPresetSource: configuration.reasoning?.source ?? null,
        regenerationSourceMessageId: regeneration?.sourceMessageId ?? null,
        regenerationInstructions: regeneration?.instructions ?? null,
        status: "pending",
        startedAt: now(),
      })
      .returning()
      .get();

    if (!storedGeneration) {
      throw new Error(`Could not create a generation for turn "${turnId}".`);
    }

    const generation = toGeneration(storedGeneration);
    return {
      generation,
      threadActivity: replyContext.activity,
      target: createReplyTarget(replyPreparer, {
        anchor: replyContext.anchor,
        activeMessageId: replyContext.activeMessageId,
        ...(regeneration && { rewrite: regeneration }),
      }),
    };
  }

  const executeAccepted = Effect.fn("Generations.executeAccepted")(function ({
    generation,
    target,
  }: AcceptedGeneration) {
    return Effect.uninterruptible(
      Effect.gen(function* () {
        // Acceptance is observable before preparation starts; cancellation still settles the row.
        const prepared = yield* Effect.exit(
          Effect.interruptible(
            Effect.yieldNow.pipe(
              Effect.andThen(() => target.prepare),
              Effect.flatMap((input) =>
                Effect.try({
                  try: () => {
                    return requireModelExecutionRequest({
                      executionId: generation.id,
                      groupId: target.threadId,
                      configuration: modelConfigurationFromGeneration(generation),
                      input,
                    });
                  },
                  catch: (cause) => cause,
                }),
              ),
            ),
          ),
        );
        if (Exit.isFailure(prepared)) {
          return yield* settleExecutionFailure(generation, "preparation", prepared.cause);
        }
        let attempt: ProviderAttempt;

        try {
          let attemptInput: StartProviderAttempt = {
            executionId: generation.id,
            providerId: generation.providerId,
            requestedModelId: generation.modelId,
            startedAt: Math.max(generation.startedAt, now()),
          };
          const attribution = getUsageAttribution(target.threadId);

          if (attribution) {
            attemptInput = { ...attemptInput, attribution };
          }

          attempt = attempts.start(attemptInput);
        } catch (cause) {
          return recordFailure(generation, "storage", cause);
        }

        const executed = yield* Effect.exit(
          Effect.interruptible(modelExecutor.execute(prepared.value)),
        );
        if (Exit.isFailure(executed)) {
          return yield* settleExecutionFailure(generation, "provider", executed.cause, attempt);
        }
        const modelExecution = executed.value;
        if (modelExecution.outcome === "invalid-accounting") {
          return recordFailure(
            generation,
            "invalid-output",
            modelExecution.cause,
            attempt,
            modelExecution.accounting,
          );
        }
        const { accounting } = modelExecution;
        let text: string;

        try {
          text = requireThreadMessageContent(modelExecution.text);
        } catch (cause) {
          return recordFailure(generation, "invalid-output", cause, attempt, accounting);
        }

        try {
          const result = database.transaction((transaction) => {
            const completionTime = finishedAt(generation, attempt);
            const { message, threadActivity } = target.append(transaction, text, completionTime);
            const storedCompletedGeneration = transaction
              .update(generationTable)
              .set({
                status: "completed",
                outputMessageId: message.id,
                finishedAt: completionTime,
              })
              .where(
                and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")),
              )
              .returning()
              .get();

            if (!storedCompletedGeneration) {
              throw new Error(`Generation "${generation.id}" is no longer pending.`);
            }

            settleProviderAttemptInTransaction(transaction, attempt.id, {
              status: "completed",
              finishedAt: completionTime,
              accounting,
            });

            return { generation: toGeneration(storedCompletedGeneration), message, threadActivity };
          });

          attempts.changed();
          return { outcome: "completed", ...result } satisfies GenerationExecution;
        } catch (cause) {
          return recordFailure(generation, "storage", cause, attempt, accounting);
        }
      }),
    );
  });

  const settleExecutionFailure = Effect.fnUntraced(function* (
    generation: Generation,
    phase: "preparation" | "provider",
    cause: Cause.Cause<unknown>,
    attempt?: ProviderAttempt,
  ) {
    let failureKind: GenerationFailureKind = phase;
    if (Cause.hasInterrupts(cause)) {
      failureKind = "interrupted";
    }
    const failure = recordFailure(generation, failureKind, Cause.squash(cause), attempt);
    // Cancellation must not hide cleanup failures, whether typed failures or defects.
    if (Cause.hasDies(cause) || (failureKind === "interrupted" && Cause.hasFails(cause))) {
      return yield* Effect.failCause(cause).pipe(Effect.orDie);
    }
    return failure;
  });

  const executeReply = Effect.fn("Generations.executeReply")(function ({
    turnId,
    intent,
    configuration,
  }: GenerateReplyRequest) {
    return Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const resolvedConfiguration = yield* restore(
          modelExecutor.resolveConfiguration(configuration),
        );
        const accepted = yield* Effect.try({
          try: () =>
            database.transaction((transaction) =>
              acceptReplyInTransaction(transaction, turnId, intent, resolvedConfiguration),
            ),
          catch: (cause) => cause,
        });
        return yield* executeAccepted(accepted);
      }),
    );
  });

  return {
    recoverInterrupted() {
      const recoveryTime = now();

      database
        .update(generationTable)
        .set({
          status: "failed",
          failureKind: "interrupted",
          finishedAt: sql`max(${generationTable.startedAt}, ${recoveryTime})`,
        })
        .where(eq(generationTable.status, "pending"))
        .run();
    },

    acceptRegenerationInTransaction,
    acceptReplyInTransaction,
    executeAccepted,
    executeReply,
    listLatestForTurns,
    resolveConfiguration: modelExecutor.resolveConfiguration,
    generateReply: Effect.fn("Generations.generateReply")(function* (
      request: GenerateReplyRequest,
    ) {
      const execution = yield* executeReply(request);

      if (execution.outcome === "failed") {
        return yield* Effect.fail(execution.cause);
      }

      const { outcome: _outcome, ...result } = execution;
      return result;
    }),
  };
}

export type GenerationEngine = ReturnType<typeof createGenerations>;
