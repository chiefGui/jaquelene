import { and, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "#backend/database/database";
import {
  requireGenerationConfiguration,
  type GenerationConfiguration,
} from "#backend/generation/configuration";
import {
  appendAssistantMessageInTransaction,
  requireThreadMessageContent,
} from "#backend/thread/threads";
import {
  threadMessageTable,
  threadTable,
  turnTable,
  type ThreadMessage,
} from "#backend/thread/schema";
import { ids, type MessageId, type TurnId } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import {
  requireResolvedReasoning,
  resolveReasoning,
  type ResolvedReasoning,
} from "#backend/model/reasoning";
import type { Models } from "#backend/provider/model-catalog";
import {
  requireModelReference,
  type ModelReference,
  type ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { normalizeProviderAccounting, type ProviderAccounting } from "#backend/usage/accounting";
import {
  createProviderAttempts,
  settleProviderAttempt,
  type ProviderAttempts,
} from "#backend/usage/provider-attempts";
import { providerAttemptTable, type ProviderAttempt } from "#backend/usage/schema";
import { requireReplyInput, type ReplyAnchor, type ReplyPreparer } from "./reply-preparation";
import {
  generationTable,
  toGeneration,
  type Generation,
  type GenerationFailureKind,
  type StoredGeneration,
} from "./schema";

export type GenerateReplyRequest = {
  turnId: TurnId;
  configuration: GenerationConfiguration;
  signal?: AbortSignal;
};

export type ResolvedGenerationConfiguration = Readonly<{
  model: ModelReference;
  reasoning?: ResolvedReasoning;
}>;

export type ReplyGenerationExecution =
  | {
      outcome: "completed";
      generation: Generation;
      message: ThreadMessage;
      activated: boolean;
    }
  | {
      outcome: "failed";
      generation: Generation;
      cause: unknown;
    };

type NormalizedProviderResult = {
  accounting: ProviderAccounting;
  text: string;
};

export type AcceptedReplyGeneration = Readonly<{
  generation: Generation;
  anchor: ReplyAnchor;
  activeMessageId: MessageId | null;
}>;

function interruptionCause(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Generation was interrupted.", { cause: signal.reason });
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

function normalizeProviderResult(
  result: ProviderGenerationResult,
  accounting: ProviderAccounting,
): NormalizedProviderResult {
  return { accounting, text: requireThreadMessageContent(result.text) };
}

export function createGenerations(
  database: Database,
  replyPreparer: ReplyPreparer,
  models: Pick<Models, "getModel">,
  providers: ProviderGenerationRouter,
  now: () => number = Date.now,
  attempts: ProviderAttempts = createProviderAttempts(database, () => undefined),
) {
  function requireProvider(model: ModelReference) {
    requireModelReference(model);

    const provider = providers.get(model.providerId);

    if (!provider) {
      throw new RangeError(`Unknown generation provider "${model.providerId}".`);
    }

    return provider;
  }
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

          const attemptSettlement =
            failureKind === "storage" && accounting
              ? ({ status: "completed", finishedAt: completionTime } as const)
              : ({ status: "failed", failureKind, finishedAt: completionTime } as const);
          const settledAttempt = settleProviderAttempt(
            transaction,
            attempt.id,
            attemptSettlement,
            accounting,
          );

          if (!settledAttempt) {
            throw new Error(`Provider attempt "${attempt.id}" is no longer pending.`);
          }
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
      return generation ? [generation] : [];
    });
  }

  function acceptReplyInTransaction(
    transaction: Pick<Database, "insert" | "select">,
    turnId: TurnId,
    requestedConfiguration: ResolvedGenerationConfiguration,
  ): AcceptedReplyGeneration {
    const configuration = {
      model: {
        providerId: requestedConfiguration.model.providerId,
        modelId: requestedConfiguration.model.modelId,
      },
      ...(requestedConfiguration.reasoning === undefined
        ? {}
        : { reasoning: requireResolvedReasoning(requestedConfiguration.reasoning) }),
    };
    requireProvider(configuration.model);
    const replyContext = requireReplyContext(transaction, turnId);

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
    const provider = requireProvider({
      providerId: generation.providerId,
      modelId: generation.modelId,
    });

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
      return recordFailure(generation, signal?.aborted ? "interrupted" : "preparation", cause);
    }

    let providerResult: ProviderGenerationResult;
    let attempt: ProviderAttempt;

    try {
      attempt = attempts.start({
        generationId: generation.id,
        threadId: anchor.threadId,
        providerId: generation.providerId,
        requestedModelId: generation.modelId,
        startedAt: Math.max(generation.startedAt, now()),
      });
    } catch (cause) {
      return recordFailure(generation, "storage", cause);
    }

    try {
      if (signal?.aborted) {
        throw interruptionCause(signal);
      }

      providerResult = await waitForOperation(
        provider.generate(
          {
            generationId: generation.id,
            threadId: anchor.threadId,
            modelId: generation.modelId,
            input,
            ...(generation.reasoning ? { reasoning: generation.reasoning } : {}),
          },
          signal,
        ),
        signal,
      );
    } catch (cause) {
      return recordFailure(
        generation,
        signal?.aborted ? "interrupted" : "provider",
        cause,
        attempt,
      );
    }

    const normalizedAccounting = normalizeProviderAccounting(providerResult);

    if (normalizedAccounting.outcome === "invalid") {
      return recordFailure(
        generation,
        "invalid-output",
        normalizedAccounting.cause,
        attempt,
        normalizedAccounting.accounting,
      );
    }
    const { accounting } = normalizedAccounting;

    let output: NormalizedProviderResult;

    try {
      output = normalizeProviderResult(providerResult, accounting);
    } catch (cause) {
      return recordFailure(generation, "invalid-output", cause, attempt, accounting);
    }

    try {
      const result = database.transaction((transaction) => {
        const completionTime = finishedAt(generation, attempt);
        const { message, activated } = appendAssistantMessageInTransaction(transaction, {
          threadId: anchor.threadId,
          turnId: generation.turnId,
          parentMessageId: anchor.inputMessageId,
          activateIfMessageId: activeMessageId,
          content: output.text,
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

        const settledAttempt = settleProviderAttempt(
          transaction,
          attempt.id,
          { status: "completed", finishedAt: completionTime },
          output.accounting,
        );

        if (!settledAttempt) {
          throw new Error(`Provider attempt "${attempt.id}" is no longer pending.`);
        }

        return { generation: toGeneration(storedCompletedGeneration), message, activated };
      });

      attempts.changed();
      return { outcome: "completed", ...result };
    } catch (cause) {
      return recordFailure(generation, "storage", cause, attempt, output.accounting);
    }
  }

  async function executeReply({
    turnId,
    configuration,
    signal,
  }: GenerateReplyRequest): Promise<ReplyGenerationExecution> {
    if (signal?.aborted) {
      throw interruptionCause(signal);
    }

    const resolvedConfiguration = await resolveConfiguration(configuration, signal);
    const accepted = database.transaction((transaction) =>
      acceptReplyInTransaction(transaction, turnId, resolvedConfiguration),
    );
    return executeAcceptedReply(accepted, signal);
  }

  async function resolveConfiguration(
    requestedConfiguration: GenerationConfiguration,
    signal?: AbortSignal,
  ): Promise<ResolvedGenerationConfiguration> {
    const configuration = {
      model: {
        providerId: requestedConfiguration.model.providerId,
        modelId: requestedConfiguration.model.modelId,
      },
      ...(requestedConfiguration.reasoningPreset === undefined
        ? {}
        : { reasoningPreset: requestedConfiguration.reasoningPreset }),
    };
    requireGenerationConfiguration(configuration);
    requireProvider(configuration.model);
    const model = await models.getModel(configuration.model, signal);
    const reasoning = resolveReasoning(model.reasoning, configuration.reasoningPreset);

    return {
      model: {
        providerId: configuration.model.providerId,
        modelId: configuration.model.modelId,
      },
      ...(reasoning ? { reasoning } : {}),
    };
  }

  return {
    recoverInterrupted() {
      const recoveryTime = now();

      const recoveredAttempts = database.transaction((transaction) => {
        const attemptResult = transaction
          .update(providerAttemptTable)
          .set({
            status: "failed",
            failureKind: "interrupted",
            finishedAt: sql`max(${providerAttemptTable.startedAt}, ${recoveryTime})`,
          })
          .where(eq(providerAttemptTable.status, "pending"))
          .run();
        transaction
          .update(generationTable)
          .set({
            status: "failed",
            failureKind: "interrupted",
            finishedAt: sql`max(${generationTable.startedAt}, ${recoveryTime})`,
          })
          .where(eq(generationTable.status, "pending"))
          .run();
        return attemptResult.changes;
      });

      if (recoveredAttempts > 0) {
        attempts.changed();
      }
    },

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

export type Generations = Pick<ReturnType<typeof createGenerations>, "generateReply">;
export type GenerationEngine = ReturnType<typeof createGenerations>;
