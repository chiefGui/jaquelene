import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterModels } from "./models";

function operationSignal() {
  return new AbortController().signal;
}

function connection(apiKey: string) {
  return {
    async withApiKey<Result>(use: (value: string) => Promise<Result>) {
      return use(apiKey);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("OpenRouter model provider", () => {
  it("loads the connected user's catalog through the consolidated OpenRouter SDK", async () => {
    const fetchRequest = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: [
          {
            architecture: {
              input_modalities: ["text"],
              modality: "text->text",
              output_modalities: ["text"],
            },
            canonical_slug: "meta-llama/text-model",
            context_length: 128_000,
            created: 1,
            default_parameters: null,
            id: "meta-llama/text-model",
            links: { details: "https://openrouter.ai/meta-llama/text-model" },
            name: "Meta: Text model",
            per_request_limits: null,
            pricing: { prompt: "0.000002", completion: "0.000006" },
            supported_parameters: [],
            supported_voices: null,
            top_provider: { is_moderated: false },
          },
        ],
      }),
    );
    const models = createOpenRouterModels(connection("openrouter-model-key"));

    await expect(models.list(operationSignal())).resolves.toEqual([
      {
        id: "meta-llama/text-model",
        name: "Text model",
        brandId: "meta",
        tokenPricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 6 },
      },
    ]);

    const sentRequest = fetchRequest.mock.calls[0]?.[0];
    expect(sentRequest).toBeInstanceOf(Request);
    if (!(sentRequest instanceof Request)) {
      throw new TypeError("OpenRouter did not issue a Request.");
    }

    expect(sentRequest.url).toBe("https://openrouter.ai/api/v1/models/user");
    expect(sentRequest.headers.get("Authorization")).toBe("Bearer openrouter-model-key");
    expect(sentRequest.headers.get("X-OpenRouter-Title")).toBe("Jaquelene");
  });

  it("lists text models available to the connected API key", async () => {
    const apiKey = "openrouter-model-key";
    const useCredential = vi.fn();
    const connection = {
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        useCredential();
        return use(apiKey);
      },
    };
    const pricing = { prompt: "0.000002", completion: "0.000006", discount: 0.5 };
    const loadModels = vi.fn(async () => [
      {
        id: "meta-llama/text-model",
        name: "Meta: Text model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing,
      },
      {
        id: "new-lab/research-model",
        name: "New Lab: Research model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing,
      },
      {
        id: "x-ai/grok-model",
        name: "SpaceXAI: Grok model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing,
      },
      {
        id: "openrouter/auto-beta",
        name: "OpenRouter: Auto Beta",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing: { prompt: "-1", completion: "-1" },
      },
      {
        id: "author/image-model",
        name: "Image model",
        architecture: { inputModalities: ["text"], outputModalities: ["image"] },
        pricing,
      },
    ]);
    const models = createOpenRouterModels(connection, loadModels);
    const tokenPricing = { inputUsdPerMillion: 1, outputUsdPerMillion: 3 };
    const signal = operationSignal();

    await expect(models.list(signal)).resolves.toEqual([
      {
        id: "meta-llama/text-model",
        name: "Text model",
        brandId: "meta",
        tokenPricing,
      },
      {
        id: "new-lab/research-model",
        name: "Research model",
        brandId: "new-lab",
        tokenPricing,
      },
      {
        id: "x-ai/grok-model",
        name: "Grok model",
        brandId: "x-ai",
        tokenPricing,
      },
      { id: "openrouter/auto-beta", name: "Auto Beta", brandId: "openrouter" },
    ]);
    expect(useCredential).toHaveBeenCalledOnce();
    expect(loadModels).toHaveBeenCalledWith(apiKey, signal);
  });

  it("preserves catalog failures", async () => {
    const failure = new Error("Catalog unavailable");
    const connection = {
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        return use("openrouter-failing-key");
      },
    };
    const loadModels = vi.fn(async () => {
      throw failure;
    });
    const models = createOpenRouterModels(connection, loadModels);

    await expect(models.list(operationSignal())).rejects.toBe(failure);
  });

  it("rejects invalid model pricing", async () => {
    const connection = {
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        return use("openrouter-model-key");
      },
    };
    const models = createOpenRouterModels(connection, async () => [
      {
        id: "author/invalid-price",
        name: "Invalid price",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing: { prompt: "not-a-price", completion: "0.000001" },
      },
    ]);

    await expect(models.list(operationSignal())).rejects.toThrow(
      'OpenRouter model "author/invalid-price" has invalid pricing.',
    );
  });
});
