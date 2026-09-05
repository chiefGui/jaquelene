import { Cause, Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import type { ModelReasoningCapability } from "#backend/model/reasoning";
import {
  ProviderOperationError,
  type ProviderGenerationRoute,
  type ProviderGenerationRouter,
} from "#backend/provider/providers";
import {
  createModelExecutor,
  ModelConfigurationError,
  ModelExecutionRequestError,
  ModelProviderError,
} from "./execution";

function modelCatalog(reasoning?: ModelReasoningCapability) {
  return {
    getModel: vi.fn(async (reference: { providerId: string; modelId: string }) => {
      const model: {
        id: string;
        name: string;
        brandId: string;
        reasoning?: ModelReasoningCapability;
      } = {
        id: reference.modelId,
        name: "Test model",
        brandId: "test",
      };

      if (reasoning !== undefined) {
        model.reasoning = reasoning;
      }

      return model;
    }),
  };
}

function generationRouter(generate: ProviderGenerationRoute["generate"]): ProviderGenerationRouter {
  return {
    get(providerId) {
      if (providerId !== "provider-a") {
        return undefined;
      }

      return { generate };
    },
  };
}

function modelInput() {
  return {
    instructions: [{ sourceKey: "test.instruction", content: "Be concise." }],
    dialogue: [{ messageId: ids.message.create(), role: "user" as const, content: "Hello" }],
  };
}

describe("model executor", () => {
  it("resolves model capabilities before execution", async () => {
    const models = modelCatalog({
      defaultPreset: "medium",
      supportedPresets: ["high", "medium", "low"],
    });
    const executor = createModelExecutor(
      models,
      generationRouter(vi.fn(() => Effect.succeed({ text: "Reply" }))),
    );

    await expect(
      Effect.runPromise(
        executor.resolveConfiguration({
          model: { providerId: "provider-a", modelId: "maker/model" },
          reasoningPreset: "high",
        }),
      ),
    ).resolves.toEqual({
      model: { providerId: "provider-a", modelId: "maker/model" },
      reasoning: { preset: "high", source: "selection" },
    });
    expect(models.getModel).toHaveBeenCalledWith(
      { providerId: "provider-a", modelId: "maker/model" },
      expect.any(AbortSignal),
    );
  });

  it("executes independent model input and normalizes provider accounting", async () => {
    const generate = vi.fn(() =>
      Effect.succeed({
        text: "Reply",
        providerGenerationId: "provider-generation-1",
        usage: {
          tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 },
        },
      }),
    );
    const executor = createModelExecutor(modelCatalog(), generationRouter(generate));
    const input = modelInput();

    await expect(
      Effect.runPromise(
        executor.execute({
          executionId: "execution-1",
          configuration: {
            model: { providerId: "provider-a", modelId: "maker/model" },
          },
          input,
        }),
      ),
    ).resolves.toEqual({
      outcome: "completed",
      text: "Reply",
      accounting: {
        providerGenerationId: "provider-generation-1",
        resolvedModelId: null,
        upstreamProviderId: null,
        finishReason: null,
        usage: {
          tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 },
        },
      },
    });
    expect(generate).toHaveBeenCalledWith({
      executionId: "execution-1",
      modelId: "maker/model",
      input,
    });
  });

  it("returns usable accounting when provider accounting is invalid", async () => {
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(
        vi.fn(() =>
          Effect.succeed({
            text: "Reply",
            providerGenerationId: "provider-generation-1",
            usage: {
              tokens: { input: { total: 3 }, output: { total: 2 }, total: 1 },
            },
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      executor.execute({
        executionId: "execution-1",
        configuration: {
          model: { providerId: "provider-a", modelId: "maker/model" },
        },
        input: modelInput(),
      }),
    );

    expect(result).toEqual({
      outcome: "invalid-accounting",
      cause: expect.objectContaining({ message: expect.stringContaining("total token count") }),
      accounting: {
        providerGenerationId: "provider-generation-1",
        resolvedModelId: null,
        upstreamProviderId: null,
        finishReason: null,
        usage: null,
      },
    });
  });

  it("classifies invalid configuration before model lookup", async () => {
    const models = modelCatalog();
    const executor = createModelExecutor(
      models,
      generationRouter(vi.fn(() => Effect.succeed({ text: "Reply" }))),
    );

    const error = await Effect.runPromise(
      Effect.flip(
        executor.resolveConfiguration({
          model: { providerId: "missing-provider", modelId: "maker/model" },
        }),
      ),
    );

    expect(error).toBeInstanceOf(ModelConfigurationError);
    expect(error).toEqual(
      expect.objectContaining({
        _tag: "ModelConfigurationError",
        cause: expect.any(RangeError),
        message: 'Unknown model provider "missing-provider".',
      }),
    );
    expect(models.getModel).not.toHaveBeenCalled();
  });

  it("classifies invalid execution requests before provider invocation", async () => {
    const generate = vi.fn(() => Effect.succeed({ text: "Reply" }));
    const executor = createModelExecutor(modelCatalog(), generationRouter(generate));
    const error = await Effect.runPromise(
      Effect.flip(
        executor.execute({
          executionId: " ",
          configuration: {
            model: { providerId: "provider-a", modelId: "maker/model" },
          },
          input: modelInput(),
        }),
      ),
    );

    expect(error).toBeInstanceOf(ModelExecutionRequestError);
    expect(error).toEqual(
      expect.objectContaining({
        _tag: "ModelExecutionRequestError",
        cause: expect.any(TypeError),
        message: "A model execution requires an execution identity.",
      }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("classifies provider failures in the Effect error channel", async () => {
    const failure = new ProviderOperationError({
      providerId: "provider-a",
      operation: "generate",
      cause: new Error("Provider unavailable"),
    });
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(vi.fn(() => Effect.fail(failure))),
    );

    const error = await Effect.runPromise(
      Effect.flip(
        executor.execute({
          executionId: "execution-1",
          configuration: {
            model: { providerId: "provider-a", modelId: "maker/model" },
          },
          input: modelInput(),
        }),
      ),
    );

    expect(error).toBeInstanceOf(ModelProviderError);
    expect(error).toEqual(
      expect.objectContaining({
        _tag: "ModelProviderError",
        cause: failure,
        message: failure.message,
      }),
    );
  });

  it("interrupts provider execution and waits for its cleanup", async () => {
    const started = Promise.withResolvers<void>();
    const cleanup = vi.fn();
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(() =>
        Effect.acquireUseRelease(
          Effect.sync(() => started.resolve()),
          () => Effect.never,
          () => Effect.sync(cleanup),
        ),
      ),
    );
    const controller = new AbortController();
    const result = Effect.runPromiseExit(
      executor.execute({
        executionId: "execution-1",
        configuration: {
          model: { providerId: "provider-a", modelId: "maker/model" },
        },
        input: modelInput(),
      }),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort(new Error("Caller interrupted execution."));
    const exit = await result;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("preserves provider defects without classifying them as operational failures", async () => {
    const defect = new Error("Provider implementation defect.");
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(() => Effect.die(defect)),
    );

    const exit = await Effect.runPromiseExit(
      executor.execute({
        executionId: "execution-1",
        configuration: {
          model: { providerId: "provider-a", modelId: "maker/model" },
        },
        input: modelInput(),
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toHaveLength(1);
      const reason = exit.cause.reasons[0]!;
      expect(Cause.isDieReason(reason)).toBe(true);
      if (Cause.isDieReason(reason)) {
        expect(reason.defect).toBe(defect);
      }
    }
  });
});
