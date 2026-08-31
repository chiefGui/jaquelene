import { and, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "#backend/database/database";
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
  requireModelReference,
  type GenerationUsage,
  type ModelReference,
  type ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { requireReplyInput, type ReplyAnchor, type ReplyPreparer } from "./reply-preparation";
import { generationTable, type Generation, type GenerationFailureKind } from "./schema";

export type GenerateReplyRequest = {
  turnId: TurnId;
  model: ModelReference;
  signal?: AbortSignal;
};

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
  text: string;
  providerGenerationId: string | null;
  resolvedModelId: string | null;
  finishReason: string | null;
  usage: GenerationUsage | null;
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

function requireOptionalText(value: string | undefined, field: string) {
  if (value === undefined) {
    return null;
  }

  if (!value.trim()) {
    throw new TypeError(`A generation provider returned an empty ${field}.`);
  }

  return value;
}

function requireTokenCount(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`A generation provider returned an invalid ${field}.`);
  }

  return value;
}

function normalizeProviderResult(result: ProviderGenerationResult): NormalizedProviderResult {
  const usage = result.usage
    ? {
        inputTokens: requireTokenCount(result.usage.inputTokens, "input token count"),
        outputTokens: requireTokenCount(result.usage.outputTokens, "output token count"),
        totalTokens: requireTokenCount(result.usage.totalTokens, "total token count"),
      }
    : null;

  return {
    text: requireThreadMessageContent(result.text),
    providerGenerationId: requireOptionalText(result.providerGenerationId, "generation identity"),
    resolvedModelId: requireOptionalText(result.resolvedModelId, "resolved model identity"),
    finishReason: requireOptionalText(result.finishReason, "finish reason"),
    usage,
  };
}

function providerResultFields(output: NormalizedProviderResult) {
  return {
    providerGenerationId: output.providerGenerationId,
    resolvedModelId: output.resolvedModelId,
    finishReason: output.finishReason,
    inputTokens: output.usage?.inputTokens ?? null,
    outputTokens: output.usage?.outputTokens ?? null,
    totalTokens: output.usage?.totalTokens ?? null,
  };
}

export function createGenerations(
  database: Database,
  replyPreparer: ReplyPreparer,
  providers: ProviderGenerationRouter,
  now: () => number = Date.now,
) {
  function requireProvider(model: ModelReference) {
    requireModelReference(model);

    const provider = providers.get(model.providerId);

    if (!provider) {
      throw new RangeError(`Unknown generation provider "${model.providerId}".`);
    }

    return provider;
  }
  function finishedAt(generation: Pick<Generation, "startedAt">) {
    return Math.max(generation.startedAt, now());
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
    output?: NormalizedProviderResult,
  ): ReplyGenerationExecution {
    let failedGeneration: Generation | undefined;

    try {
      failedGeneration = database
        .update(generationTable)
        .set({
          status: "failed",
          failureKind,
          finishedAt: finishedAt(generation),
        })
        .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
        .returning()
        .get();
    } catch (failure) {
      throw new AggregateError(
        [cause, failure],
        `Could not record the failure of generation "${generation.id}".`,
      );
    }

    if (!failedGeneration) {
      throw cause;
    }

    if (output) {
      try {
        const recordedGeneration = database
          .update(generationTable)
          .set(providerResultFields(output))
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "failed")))
          .returning()
          .get();

        if (!recordedGeneration) {
          throw new Error(`Generation "${generation.id}" is no longer failed.`);
        }

        failedGeneration = recordedGeneration;
      } catch (failure) {
        throw new AggregateError(
          [cause, failure],
          `Generation "${generation.id}" failed, but its provider result could not be recorded.`,
        );
      }
    }

    return { outcome: "failed", generation: failedGeneration, cause };
  }

  function listLatestForTurns(turnIds: readonly TurnId[]) {
    const uniqueTurnIds = [...new Set(turnIds)];

    if (uniqueTurnIds.length === 0) {
      return [];
    }

    const newerGeneration = alias(generationTable, "newer_generation");
    const generations = database
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
      generations.map((generation) => [generation.turnId, generation]),
    );

    return uniqueTurnIds.flatMap((turnId) => {
      const generation = generationByTurn.get(turnId);
      return generation ? [generation] : [];
    });
  }

  function acceptReplyInTransaction(
    transaction: Pick<Database, "insert" | "select">,
    turnId: TurnId,
    requestedModel: ModelReference,
  ): AcceptedReplyGeneration {
    const model = {
      providerId: requestedModel.providerId,
      modelId: requestedModel.modelId,
    };
    requireProvider(model);
    const replyContext = requireReplyContext(transaction, turnId);

    const pendingGeneration = transaction
      .select({ id: generationTable.id })
      .from(generationTable)
      .where(and(eq(generationTable.turnId, turnId), eq(generationTable.status, "pending")))
      .get();

    if (pendingGeneration) {
      throw new RangeError(`Turn "${turnId}" already has a pending generation.`);
    }

    const generation = transaction
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId,
        providerId: model.providerId,
        modelId: model.modelId,
        status: "pending",
        startedAt: now(),
      })
      .returning()
      .get();

    if (!generation) {
      throw new Error(`Could not create a generation for turn "${turnId}".`);
    }

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
      return recordFailure(generation, signal?.aborted ? "interrupted" : "prompt", cause);
    }

    let providerResult: ProviderGenerationResult;

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
          },
          signal,
        ),
        signal,
      );
    } catch (cause) {
      return recordFailure(generation, signal?.aborted ? "interrupted" : "provider", cause);
    }

    let output: NormalizedProviderResult;

    try {
      output = normalizeProviderResult(providerResult);
    } catch (cause) {
      return recordFailure(generation, "invalid-output", cause);
    }

    try {
      const result = database.transaction((transaction) => {
        const completionTime = finishedAt(generation);
        const { message, activated } = appendAssistantMessageInTransaction(transaction, {
          threadId: anchor.threadId,
          turnId: generation.turnId,
          parentMessageId: anchor.inputMessageId,
          activateIfMessageId: activeMessageId,
          content: output.text,
          createdAt: completionTime,
        });
        const completedGeneration = transaction
          .update(generationTable)
          .set({
            status: "completed",
            ...providerResultFields(output),
            outputMessageId: message.id,
            finishedAt: completionTime,
          })
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
          .returning()
          .get();

        if (!completedGeneration) {
          throw new Error(`Generation "${generation.id}" is no longer pending.`);
        }

        return { generation: completedGeneration, message, activated };
      });

      return { outcome: "completed", ...result };
    } catch (cause) {
      return recordFailure(generation, "storage", cause, output);
    }
  }

  async function executeReply({
    turnId,
    model,
    signal,
  }: GenerateReplyRequest): Promise<ReplyGenerationExecution> {
    if (signal?.aborted) {
      throw interruptionCause(signal);
    }

    const accepted = database.transaction((transaction) =>
      acceptReplyInTransaction(transaction, turnId, model),
    );
    return executeAcceptedReply(accepted, signal);
  }

  function requireRegisteredModel(model: ModelReference) {
    requireProvider(model);
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

    acceptReplyInTransaction,
    executeAcceptedReply,
    executeReply,
    listLatestForTurns,
    requireRegisteredModel,
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
