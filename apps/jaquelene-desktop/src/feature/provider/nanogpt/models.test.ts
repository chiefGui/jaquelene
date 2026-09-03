import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createNanoGptModels } from "./models";

afterEach(() => vi.restoreAllMocks());

function operationSignal() {
  return new AbortController().signal;
}

function connection(apiKey = "nanogpt-model-key") {
  return {
    async withApiKey<Result>(use: (value: string) => Promise<Result>) {
      return use(apiKey);
    },
  };
}

describe("NanoGPT model provider", () => {
  it("requests the authenticated detailed catalog", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: [] }, { status: 200 }));
    const signal = operationSignal();
    const models = createNanoGptModels(connection());

    await expect(models.list(signal)).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith("https://nano-gpt.com/api/v1/models?detailed=true", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer nanogpt-model-key",
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("reports catalog protocol failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service unavailable", { status: 503 }),
    );
    const models = createNanoGptModels(connection());

    await expect(models.list(operationSignal())).rejects.toThrow(
      "NanoGPT rejected the model request with status 503.",
    );

    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(models.list(operationSignal())).rejects.toThrow(
      "NanoGPT returned an invalid JSON model catalog.",
    );
  });

  it("normalizes NanoGPT's detailed text model catalog", async () => {
    const loadModels = vi.fn(async () => [
      {
        id: "meta-llama/reasoning-model",
        owned_by: "meta-llama",
        name: "Meta: Reasoning model",
        context_length: 128_000,
        capabilities: { reasoning: true },
        reasoning_efforts: ["none", "low", "high", "max"],
        pricing: {
          prompt: 1.25,
          completion: 4.5,
          currency: "USD",
          unit: "per_million_tokens",
        },
      },
      {
        id: "standalone-model",
        owned_by: "openai",
        name: "Standalone model",
        context_length: null,
        capabilities: { reasoning: false },
        pricing: {
          prompt: 0.1,
          completion: 0.4,
          currency: "USD",
          unit: "per_million_tokens",
        },
      },
      {
        id: "qwen/omni-model",
        owned_by: "qwen",
        name: "Omni model",
        context_length: 32_000,
        capabilities: { reasoning: true },
        pricing: {
          currency: "USD",
          unit: "per_million_tokens",
          note: "varies_by_modality",
        },
      },
    ]);
    const models = createNanoGptModels(connection(), loadModels);
    const signal = operationSignal();

    await expect(models.list(signal)).resolves.toEqual([
      {
        id: "meta-llama/reasoning-model",
        name: "Reasoning model",
        brandId: "meta",
        contextWindowTokens: 128_000,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic", "max", "high", "low", "off"],
        },
        tokenPricing: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 4.5 },
      },
      {
        id: "standalone-model",
        name: "Standalone model",
        brandId: "openai",
        tokenPricing: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
      },
      {
        id: "qwen/omni-model",
        name: "Omni model",
        brandId: "qwen",
        contextWindowTokens: 32_000,
        reasoning: {
          defaultPreset: "automatic",
          supportedPresets: ["automatic"],
        },
      },
    ]);
    expect(loadModels).toHaveBeenCalledWith("nanogpt-model-key", signal);
  });

  it("preserves catalog failures", async () => {
    const failure = new Error("Catalog unavailable");
    const models = createNanoGptModels(connection(), async () => {
      throw failure;
    });

    await expect(models.list(operationSignal())).rejects.toBe(failure);
  });

  it.each([
    [
      {
        prompt: "1.25",
        completion: 4.5,
        currency: "USD",
        unit: "per_million_tokens",
      },
    ],
    [{ prompt: 1.25, completion: 4.5, currency: "EUR", unit: "per_million_tokens" }],
    [{ prompt: 1.25, currency: "USD", unit: "per_million_tokens" }],
  ])("rejects invalid model pricing", async (pricing) => {
    const models = createNanoGptModels(connection(), async () => [
      {
        id: "maker/invalid-price",
        owned_by: "maker",
        name: "Invalid price",
        context_length: 128_000,
        capabilities: { reasoning: false },
        pricing,
      },
    ]);

    await expect(models.list(operationSignal())).rejects.toThrow(
      'NanoGPT model "maker/invalid-price" has invalid pricing.',
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid context window %s",
    async (contextLength) => {
      const models = createNanoGptModels(connection(), async () => [
        {
          id: "maker/invalid-context",
          owned_by: "maker",
          name: "Invalid context",
          context_length: contextLength,
          capabilities: { reasoning: false },
          pricing: {
            prompt: 1,
            completion: 2,
            currency: "USD",
            unit: "per_million_tokens",
          },
        },
      ]);

      await expect(models.list(operationSignal())).rejects.toThrow(
        'NanoGPT model "maker/invalid-context" context window must be a positive safe integer.',
      );
    },
  );
});
