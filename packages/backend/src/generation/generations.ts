import { and, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "#backend/database/database";
import type { RequestedModelConfiguration } from "#backend/model/configuration";
import {
  appendAssistantMessageInTransaction,
  requireThreadMessageContent,
  type ThreadActivity,
} from "#backend/thread/threads";
import {
  threadMessageTable,
  threadTable,
  turnTable,
  type ThreadMessage,
} from "#backend/thread/schema";
import { ids, type MessageId, type ThreadId, type TurnId } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import {
  requireModelExecutionRequest,
  requireResolvedModelConfiguration,
  type ModelExecutionRequest,
  type ModelExecutionRunner,
  type ModelExecutionResult,
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
import { requireReplyInput, type ReplyAnchor, type ReplyPreparer } from "./reply-preparation";
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
  signal?: AbortSignal;
};

export type ReplyGenerationExecution =
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

export type AcceptedReplyGeneration = Readonly<{
  generation: Generation;
  anchor: ReplyAnchor;
  activeMessageId: MessageId | null;
}>;

export type GenerationOptions = Readonly<{
  database: Database;
  replyPreparer: ReplyPreparer;
  modelExecutor: ModelExecutionRunner;
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

function interruptionCause(signal: AbortSignal) {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error("Generation was interrupted.", { cause: signal.reason });
}

function waitForOperation<Result>(operation: Promise<Result>, signal?: AbortSignal) {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    void operation.then(
      () => undefined,
      () => undefined,
    );
    return Promise.reject(interruptionCause(signal));
  }

  const interruptionSignal = signal;

  return new Promise<Result>((resolve, reject) => {
    let settled = false;

    function beginSettlement() {
      if (settled) {
        return false;
      }

      settled = true;
      interruptionSignal.removeEventListener("abort", onAbort);
      return true;
    }

    function onAbort() {
      if (beginSettlement()) {
        reject(interruptionCause(interruptionSignal));
      }
    }

    interruptionSignal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        if (beginSettlement()) {
          resolve(value);
        }
      },
      (cause: unknown) => {
        if (beginSettlement()) {
          reject(cause);
        }
      },
    );

    if (interruptionSignal.aborted) {
      onAbort();
    }
  });
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
    };
  }

  function recordFailure(
    generation: Pick<Generation, "id" | "startedAt">,
    failureKind: GenerationFailureKind,
    cause: unknown,
    attempt?: ProviderAttempt,
    accounting?: ProviderAccounting,
  ): ReplyGenerationExecution {
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
  ): AcceptedReplyGeneration {
    const replyContext = requireReplyContext(transaction, turnId);

    return acceptReplyForContext(transaction, turnId, intent, requestedConfiguration, replyContext);
  }

  function acceptRegenerationInTransaction(
    transaction: Pick<Database, "insert" | "select">,
    assistantMessageId: MessageId,
    requestedConfiguration: ResolvedModelConfiguration,
  ): AcceptedReplyGeneration {
    const source = transaction
      .select({
        author: threadMessageTable.author,
        turnId: generationTable.turnId,
      })
      .from(generationTable)
      .innerJoin(
        threadMessageTable,
        and(
          eq(threadMessageTable.turnId, generationTable.turnId),
          eq(threadMessageTable.id, generationTable.outputMessageId),
        ),
      )
      .where(
        and(
          eq(generationTable.outputMessageId, assistantMessageId),
          eq(generationTable.status, "completed"),
        ),
      )
      .get();

    if (!source) {
      throw new RangeError(
        `Message "${assistantMessageId}" is not the output of a completed generation.`,
      );
    }

    if (source.author !== "assistant") {
      throw new TypeError(`Message "${assistantMessageId}" is not an assistant message.`);
    }

    const replyContext = requireReplyContext(transaction, source.turnId);

    if (replyContext.activeMessageId !== assistantMessageId) {
      throw new RangeError(`Message "${assistantMessageId}" is not the active thread reply.`);
    }

    return acceptReplyForContext(
      transaction,
      source.turnId,
      "regeneration",
      requestedConfiguration,
      replyContext,
    );
  }

  function acceptReplyForContext(
    transaction: Pick<Database, "insert" | "select">,
    turnId: TurnId,
    intent: GenerationIntent,
    requestedConfiguration: ResolvedModelConfiguration,
    replyContext: ReturnType<typeof requireReplyContext>,
  ): AcceptedReplyGeneration {
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
        status: "pending",
        startedAt: now(),
      })
      .returning()
      .get();

    if (!storedGeneration) {
      throw new Error(`Could not create a generation for turn "${turnId}".`);
    }

    const generation = toGeneration(storedGeneration);
    return { generation, ...replyContext };
  }

  async function executeAcceptedReply(
    { generation, anchor, activeMessageId }: AcceptedReplyGeneration,
    signal?: AbortSignal,
  ): Promise<ReplyGenerationExecution> {
    if (signal?.aborted) {
      return recordFailure(generation, "interrupted", interruptionCause(signal));
    }

    let input: ModelInput;

    try {
      input = requireReplyInput(
        await waitForOperation(
          Promise.resolve(replyPreparer.prepare({ ...anchor }, signal)),
          signal,
        ),
        anchor,
      );
    } catch (cause) {
      let failureKind: GenerationFailureKind = "preparation";

      if (signal?.aborted) {
        failureKind = "interrupted";
      }

      return recordFailure(generation, failureKind, cause);
    }

    let executionRequest: ModelExecutionRequest;

    try {
      executionRequest = requireModelExecutionRequest({
        executionId: generation.id,
        groupId: anchor.threadId,
        configuration: modelConfigurationFromGeneration(generation),
        input,
      });
    } catch (cause) {
      return recordFailure(generation, "preparation", cause);
    }

    let attempt: ProviderAttempt;

    try {
      let attemptInput: StartProviderAttempt = {
        executionId: generation.id,
        providerId: generation.providerId,
        requestedModelId: generation.modelId,
        startedAt: Math.max(generation.startedAt, now()),
      };
      const attribution = getUsageAttribution(anchor.threadId);

      if (attribution) {
        attemptInput = { ...attemptInput, attribution };
      }

      attempt = attempts.start(attemptInput);
    } catch (cause) {
      return recordFailure(generation, "storage", cause);
    }

    let modelExecution: ModelExecutionResult;

    try {
      modelExecution = await modelExecutor.execute(executionRequest, signal);
    } catch (cause) {
      let failureKind: GenerationFailureKind = "provider";

      if (signal?.aborted) {
        failureKind = "interrupted";
      }

      return recordFailure(generation, failureKind, cause, attempt);
    }

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
        const { message, threadActivity } = appendAssistantMessageInTransaction(transaction, {
          threadId: anchor.threadId,
          turnId: generation.turnId,
          parentMessageId: anchor.inputMessageId,
          activateIfMessageId: activeMessageId,
          content: text,
          createdAt: completionTime,
        });
        const storedCompletedGeneration = transaction
          .update(generationTable)
          .set({
            status: "completed",
            outputMessageId: message.id,
            finishedAt: completionTime,
          })
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
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
      return { outcome: "completed", ...result };
    } catch (cause) {
      return recordFailure(generation, "storage", cause, attempt, accounting);
    }
  }

  async function executeReply({
    turnId,
    intent,
    configuration,
    signal,
  }: GenerateReplyRequest): Promise<ReplyGenerationExecution> {
    if (signal?.aborted) {
      throw interruptionCause(signal);
    }

    const resolvedConfiguration = await resolveConfiguration(configuration, signal);
    const accepted = database.transaction((transaction) =>
      acceptReplyInTransaction(transaction, turnId, intent, resolvedConfiguration),
    );
    return executeAcceptedReply(accepted, signal);
  }

  async function resolveConfiguration(
    requestedConfiguration: RequestedModelConfiguration,
    signal?: AbortSignal,
  ): Promise<ResolvedModelConfiguration> {
    return modelExecutor.resolveConfiguration(requestedConfiguration, signal);
  }

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
    executeAcceptedReply,
    executeReply,
    listLatestForTurns,
    resolveConfiguration,
    async generateReply(request: GenerateReplyRequest) {
      const execution = await executeReply(request);

      if (execution.outcome === "failed") {
        throw execution.cause;
      }

      const { outcome: _outcome, ...result } = execution;
      return result;
    },
  };
}

export type GenerationEngine = ReturnType<typeof createGenerations>;
