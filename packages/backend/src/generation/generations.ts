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
  type GenerationUsage,
  type ModelReference,
  type ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
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

type NormalizedProviderAccounting = {
  providerGenerationId: string | null;
  resolvedModelId: string | null;
  upstreamProviderId: string | null;
  finishReason: string | null;
  usage: GenerationUsage | null;
};

type NormalizedProviderResult = NormalizedProviderAccounting & {
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

function normalizeProviderMetadata(
  result: ProviderGenerationResult,
): Omit<NormalizedProviderAccounting, "usage"> {
  return {
    providerGenerationId: requireOptionalText(result.providerGenerationId, "generation identity"),
    resolvedModelId: requireOptionalText(result.resolvedModelId, "resolved model identity"),
    upstreamProviderId: requireOptionalText(
      result.upstreamProviderId,
      "upstream provider identity",
    ),
    finishReason: requireOptionalText(result.finishReason, "finish reason"),
  };
}

function normalizeProviderUsage(result: ProviderGenerationResult): GenerationUsage | null {
  if (!result.usage) {
    return null;
  }

  const usage: GenerationUsage = {
    tokens: {
      input: {
        total: requireTokenCount(result.usage.tokens.input.total, "input token count"),
        ...(result.usage.tokens.input.cacheRead === undefined
          ? {}
          : {
              cacheRead: requireTokenCount(
                result.usage.tokens.input.cacheRead,
                "cache-read input token count",
              ),
            }),
        ...(result.usage.tokens.input.cacheWrite === undefined
          ? {}
          : {
              cacheWrite: requireTokenCount(
                result.usage.tokens.input.cacheWrite,
                "cache-write input token count",
              ),
            }),
      },
      output: {
        total: requireTokenCount(result.usage.tokens.output.total, "output token count"),
        ...(result.usage.tokens.output.reasoning === undefined
          ? {}
          : {
              reasoning: requireTokenCount(
                result.usage.tokens.output.reasoning,
                "reasoning output token count",
              ),
            }),
      },
      total: requireTokenCount(result.usage.tokens.total, "total token count"),
    },
    ...(result.usage.cost
      ? {
          cost: {
            currency: result.usage.cost.currency,
            amountNanos: requireTokenCount(result.usage.cost.amountNanos, "cost amount in nanos"),
            source: result.usage.cost.source,
          },
        }
      : {}),
  };
  const { input, output } = usage.tokens;

  if (input.cacheRead !== undefined && input.cacheRead > input.total) {
    throw new TypeError("A generation provider returned cache-read tokens above input tokens.");
  }

  if (input.cacheWrite !== undefined && input.cacheWrite > input.total) {
    throw new TypeError("A generation provider returned cache-write tokens above input tokens.");
  }

  if (output.reasoning !== undefined && output.reasoning > output.total) {
    throw new TypeError("A generation provider returned reasoning tokens above output tokens.");
  }

  if (usage.tokens.total < input.total || usage.tokens.total < output.total) {
    throw new TypeError("A generation provider returned an invalid total token count.");
  }

  if (
    usage.cost &&
    (usage.cost.currency !== "USD" ||
      (usage.cost.source !== "provider-reported" && usage.cost.source !== "estimated"))
  ) {
    throw new TypeError("A generation provider returned unsupported cost metadata.");
  }

  return usage;
}

function normalizeProviderAccounting(result: ProviderGenerationResult) {
  const causes: unknown[] = [];
  let metadata: Omit<NormalizedProviderAccounting, "usage"> = {
    providerGenerationId: null,
    resolvedModelId: null,
    upstreamProviderId: null,
    finishReason: null,
  };
  let usage: GenerationUsage | null = null;

  try {
    metadata = normalizeProviderMetadata(result);
  } catch (cause) {
    causes.push(cause);
  }

  try {
    usage = normalizeProviderUsage(result);
  } catch (cause) {
    causes.push(cause);
  }

  const accounting = { ...metadata, usage } satisfies NormalizedProviderAccounting;

  return causes.length === 0
    ? { outcome: "valid" as const, accounting }
    : {
        outcome: "invalid" as const,
        accounting,
        cause:
          causes.length === 1
            ? causes[0]
            : new AggregateError(causes, "A generation provider returned invalid accounting."),
      };
}

function normalizeProviderResult(
  result: ProviderGenerationResult,
  accounting: NormalizedProviderAccounting,
): NormalizedProviderResult {
  return { ...accounting, text: requireThreadMessageContent(result.text) };
}

function providerResultFields(output: NormalizedProviderAccounting) {
  return {
    providerGenerationId: output.providerGenerationId,
    resolvedModelId: output.resolvedModelId,
    upstreamProviderId: output.upstreamProviderId,
    finishReason: output.finishReason,
    inputTokens: output.usage?.tokens.input.total ?? null,
    cacheReadInputTokens: output.usage?.tokens.input.cacheRead ?? null,
    cacheWriteInputTokens: output.usage?.tokens.input.cacheWrite ?? null,
    outputTokens: output.usage?.tokens.output.total ?? null,
    reasoningOutputTokens: output.usage?.tokens.output.reasoning ?? null,
    totalTokens: output.usage?.tokens.total ?? null,
    costCurrency: output.usage?.cost?.currency ?? null,
    costAmountNanos: output.usage?.cost?.amountNanos ?? null,
    costSource: output.usage?.cost?.source ?? null,
  };
}

export function createGenerations(
  database: Database,
  replyPreparer: ReplyPreparer,
  models: Pick<Models, "getModel">,
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
  function finishedAt(generation: Pick<Generation, "startedAt" | "providerStartedAt">) {
    return Math.max(generation.startedAt, generation.providerStartedAt ?? 0, now());
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
    generation: Pick<Generation, "id" | "startedAt" | "providerStartedAt">,
    failureKind: GenerationFailureKind,
    cause: unknown,
    output?: NormalizedProviderAccounting,
  ): ReplyGenerationExecution {
    let failedGeneration: StoredGeneration | undefined;

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
    let dispatchedGeneration: Generation;

    try {
      const storedDispatchedGeneration = database
        .update(generationTable)
        .set({ providerStartedAt: Math.max(generation.startedAt, now()) })
        .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
        .returning()
        .get();

      if (!storedDispatchedGeneration) {
        throw new Error(`Generation "${generation.id}" is no longer pending.`);
      }

      dispatchedGeneration = toGeneration(storedDispatchedGeneration);
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
        dispatchedGeneration,
        signal?.aborted ? "interrupted" : "provider",
        cause,
      );
    }

    const normalizedAccounting = normalizeProviderAccounting(providerResult);

    if (normalizedAccounting.outcome === "invalid") {
      return recordFailure(
        dispatchedGeneration,
        "invalid-output",
        normalizedAccounting.cause,
        normalizedAccounting.accounting,
      );
    }
    const { accounting } = normalizedAccounting;

    let output: NormalizedProviderResult;

    try {
      output = normalizeProviderResult(providerResult, accounting);
    } catch (cause) {
      return recordFailure(dispatchedGeneration, "invalid-output", cause, accounting);
    }

    try {
      const result = database.transaction((transaction) => {
        const completionTime = finishedAt(dispatchedGeneration);
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
            ...providerResultFields(output),
            outputMessageId: message.id,
            finishedAt: completionTime,
          })
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
          .returning()
          .get();

        if (!storedCompletedGeneration) {
          throw new Error(`Generation "${generation.id}" is no longer pending.`);
        }

        return { generation: toGeneration(storedCompletedGeneration), message, activated };
      });

      return { outcome: "completed", ...result };
    } catch (cause) {
      return recordFailure(dispatchedGeneration, "storage", cause, output);
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

      database
        .update(generationTable)
        .set({
          status: "failed",
          failureKind: "interrupted",
          finishedAt: sql`max(${generationTable.startedAt}, coalesce(${generationTable.providerStartedAt}, 0), ${recoveryTime})`,
        })
        .where(eq(generationTable.status, "pending"))
        .run();
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
