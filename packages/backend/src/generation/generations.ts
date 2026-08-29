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
import { ids, type MessageId, type ThreadId, type TurnId } from "#backend/id";
import type { GenerationPrompt, GenerationPromptCompiler } from "./prompt";
import {
  requireModelReference,
  type GenerationProvider,
  type GenerationProviderResult,
  type GenerationUsage,
  type ModelReference,
} from "./provider";
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

type TurnGenerationInput = {
  threadId: ThreadId;
  inputMessageId: MessageId;
  activeMessageId: MessageId | null;
};

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

function normalizeProviderResult(result: GenerationProviderResult): NormalizedProviderResult {
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

function requirePrompt(prompt: GenerationPrompt, turnId: TurnId, input: TurnGenerationInput) {
  if (prompt.turnId !== turnId) {
    throw new Error(`The generation prompt does not belong to turn "${turnId}".`);
  }

  if (prompt.threadId !== input.threadId || prompt.inputMessageId !== input.inputMessageId) {
    throw new Error(`The generation prompt does not identify the input for turn "${turnId}".`);
  }

  if (prompt.messages.length === 0 || prompt.messages.at(-1)?.role !== "user") {
    throw new TypeError("A reply generation prompt must end with a user message.");
  }

  return {
    ...prompt,
    messages: prompt.messages.map((message) => ({ ...message })),
  };
}

export function createGenerations(
  database: Database,
  promptCompiler: GenerationPromptCompiler,
  providers: readonly GenerationProvider[],
  now: () => number = Date.now,
) {
  const providersById = new Map<string, GenerationProvider>();

  for (const provider of providers) {
    if (!provider.id.trim()) {
      throw new TypeError("Generation providers require an identity.");
    }

    if (providersById.has(provider.id)) {
      throw new Error(`Generation provider "${provider.id}" is registered more than once.`);
    }

    providersById.set(provider.id, provider);
  }

  function requireProvider(model: ModelReference) {
    requireModelReference(model);

    const provider = providersById.get(model.providerId);

    if (!provider) {
      throw new RangeError(`Unknown generation provider "${model.providerId}".`);
    }

    return provider;
  }

  function finishedAt(generation: Pick<Generation, "startedAt">) {
    return Math.max(generation.startedAt, now());
  }

  function requireTurnGenerationInput(turnId: TurnId): TurnGenerationInput {
    const input = database
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

    return { ...input, inputMessageId: input.inputMessageId };
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

  async function executeReply({
    turnId,
    model: requestedModel,
    signal,
  }: GenerateReplyRequest): Promise<ReplyGenerationExecution> {
    const model = {
      providerId: requestedModel.providerId,
      modelId: requestedModel.modelId,
    };
    const provider = requireProvider(model);

    if (signal?.aborted) {
      throw interruptionCause(signal);
    }

    const input = requireTurnGenerationInput(turnId);

    const pendingGeneration = database
      .select({ id: generationTable.id })
      .from(generationTable)
      .where(and(eq(generationTable.turnId, turnId), eq(generationTable.status, "pending")))
      .get();

    if (pendingGeneration) {
      throw new RangeError(`Turn "${turnId}" already has a pending generation.`);
    }

    const generation = {
      id: ids.generation.create(),
      turnId,
      providerId: model.providerId,
      modelId: model.modelId,
      status: "pending",
      startedAt: now(),
    } as const;

    database.insert(generationTable).values(generation).run();

    let prompt: GenerationPrompt;

    try {
      prompt = requirePrompt(
        await waitForOperation(Promise.resolve(promptCompiler.compile(turnId, signal)), signal),
        turnId,
        input,
      );
    } catch (cause) {
      return recordFailure(generation, signal?.aborted ? "interrupted" : "prompt", cause);
    }

    let providerResult: GenerationProviderResult;

    try {
      if (signal?.aborted) {
        throw interruptionCause(signal);
      }

      providerResult = await waitForOperation(
        provider.generate({
          generationId: generation.id,
          threadId: prompt.threadId,
          modelId: model.modelId,
          messages: prompt.messages,
          ...(signal ? { signal } : {}),
        }),
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
          threadId: prompt.threadId,
          turnId,
          parentMessageId: prompt.inputMessageId,
          activateIfMessageId: input.activeMessageId,
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

    executeReply,
    listLatestForTurns,
    requireRegisteredModel(model: ModelReference) {
      requireProvider(model);
    },
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
