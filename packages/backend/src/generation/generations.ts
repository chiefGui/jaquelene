import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../database/database";
import {
  appendAssistantMessageInTransaction,
  requireThreadMessageContent,
} from "../thread/threads";
import { threadTable } from "../thread/schema";
import { ids, type GenerationId, type TurnId } from "../id";
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

type NormalizedProviderResult = {
  text: string;
  providerGenerationId: string | null;
  resolvedModelId: string | null;
  finishReason: string | null;
  usage: GenerationUsage | null;
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

function requirePrompt(prompt: GenerationPrompt, turnId: TurnId) {
  if (prompt.turnId !== turnId) {
    throw new Error(`The generation prompt does not belong to turn "${turnId}".`);
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

  function finishedAt(generation: Pick<Generation, "startedAt">) {
    return Math.max(generation.startedAt, now());
  }

  function failAndThrow(
    generation: Pick<Generation, "id" | "startedAt">,
    failureKind: GenerationFailureKind,
    cause: unknown,
    output?: NormalizedProviderResult,
  ): never {
    let failedGeneration: { id: GenerationId } | undefined;

    try {
      failedGeneration = database
        .update(generationTable)
        .set({
          status: "failed",
          failureKind,
          finishedAt: finishedAt(generation),
        })
        .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")))
        .returning({ id: generationTable.id })
        .get();
    } catch (failure) {
      throw new AggregateError(
        [cause, failure],
        `Could not record the failure of generation "${generation.id}".`,
      );
    }

    if (failedGeneration && output) {
      try {
        database
          .update(generationTable)
          .set(providerResultFields(output))
          .where(and(eq(generationTable.id, generation.id), eq(generationTable.status, "failed")))
          .run();
      } catch (failure) {
        throw new AggregateError(
          [cause, failure],
          `Generation "${generation.id}" failed, but its provider result could not be recorded.`,
        );
      }
    }

    throw cause;
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

    async generateReply({ turnId, model, signal }: GenerateReplyRequest) {
      requireModelReference(model);

      const provider = providersById.get(model.providerId);

      if (!provider) {
        throw new RangeError(`Unknown generation provider "${model.providerId}".`);
      }

      if (signal?.aborted) {
        throw interruptionCause(signal);
      }

      const prompt = requirePrompt(
        await waitForOperation(Promise.resolve(promptCompiler.compile(turnId, signal)), signal),
        turnId,
      );
      const thread = database
        .select({ activeMessageId: threadTable.activeMessageId })
        .from(threadTable)
        .where(eq(threadTable.id, prompt.threadId))
        .get();

      if (!thread) {
        throw new Error(`Turn "${turnId}" belongs to a missing thread.`);
      }

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
        failAndThrow(generation, signal?.aborted ? "interrupted" : "provider", cause);
      }

      let output: NormalizedProviderResult;

      try {
        output = normalizeProviderResult(providerResult);
      } catch (cause) {
        failAndThrow(generation, "invalid-output", cause);
      }

      try {
        return database.transaction((transaction) => {
          const completionTime = finishedAt(generation);
          const { message, activated } = appendAssistantMessageInTransaction(transaction, {
            threadId: prompt.threadId,
            turnId,
            parentMessageId: prompt.inputMessageId,
            activateIfMessageId: thread.activeMessageId,
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
            .where(
              and(eq(generationTable.id, generation.id), eq(generationTable.status, "pending")),
            )
            .returning()
            .get();

          if (!completedGeneration) {
            throw new Error(`Generation "${generation.id}" is no longer pending.`);
          }

          return { generation: completedGeneration, message, activated };
        });
      } catch (cause) {
        failAndThrow(generation, "storage", cause, output);
      }
    },
  };
}

export type Generations = Pick<ReturnType<typeof createGenerations>, "generateReply">;
