import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import type { ModelReasoningCapability } from "#backend/model/reasoning";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { createModelExecutor } from "./execution";

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

function generationRouter(
  generate: (
    request: ProviderGenerationRequest,
    signal?: AbortSignal,
  ) => Promise<ProviderGenerationResult>,
): ProviderGenerationRouter {
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
      generationRouter(vi.fn(async () => ({ text: "Reply" }))),
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
    const generate = vi.fn(async () => ({
      text: "Reply",
      providerGenerationId: "provider-generation-1",
      usage: {
        tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 },
      },
    }));
    const executor = createModelExecutor(modelCatalog(), generationRouter(generate));
    const input = modelInput();

    await expect(
      Effect.runPromise(
        executor.execute({
          operationId: "operation-1",
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
    expect(generate).toHaveBeenCalledWith(
      {
        operationId: "operation-1",
        modelId: "maker/model",
        input,
      },
      expect.any(AbortSignal),
    );
  });

  it("returns usable accounting when provider accounting is invalid", async () => {
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(
        vi.fn(async () => ({
          text: "Reply",
          providerGenerationId: "provider-generation-1",
          usage: {
            tokens: { input: { total: 3 }, output: { total: 2 }, total: 1 },
          },
        })),
      ),
    );

    const result = await Effect.runPromise(
      executor.execute({
        operationId: "operation-1",
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

  it("preserves provider failures in the Effect error channel", async () => {
    const failure = new Error("Provider unavailable");
    const executor = createModelExecutor(
      modelCatalog(),
      generationRouter(
        vi.fn(async () => {
          throw failure;
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        executor.execute({
          operationId: "operation-1",
          configuration: {
            model: { providerId: "provider-a", modelId: "maker/model" },
          },
          input: modelInput(),
        }),
      ),
    ).rejects.toBe(failure);
  });
});
