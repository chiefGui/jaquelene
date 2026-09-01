import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterModels } from "./models";

function operationSignal() {
  return new AbortController().signal;
}

describe("OpenRouter model provider", () => {
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
        reasoning: {
          mandatory: false,
          defaultEffort: "medium",
          supportedEfforts: ["high", "medium", "low", "none"],
        },
      },
      {
        id: "new-lab/research-model",
        name: "New Lab: Research model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing,
        reasoning: { mandatory: true, defaultEffort: null, supportedEfforts: null },
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
        reasoning: {
          required: false,
          defaultEffort: "medium",
          supportedEfforts: ["high", "medium", "low", "none"],
        },
        tokenPricing,
      },
      {
        id: "new-lab/research-model",
        name: "Research model",
        brandId: "new-lab",
        reasoning: {
          required: true,
          supportedEfforts: ["max", "xhigh", "high", "medium", "low", "minimal"],
        },
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

  it.each([
    [{ mandatory: true, supportedEfforts: ["high", "none"] }, "cannot disable required reasoning"],
    [{ mandatory: true, defaultEffort: "none" }, "cannot default required reasoning off"],
    [
      { mandatory: false, defaultEffort: "high", supportedEfforts: ["medium", "low"] },
      "unsupported default reasoning effort",
    ],
    [
      { mandatory: false, supportedEfforts: ["high", "future"] },
      "unknown supported reasoning effort",
    ],
  ])("rejects inconsistent reasoning metadata", async (reasoning, message) => {
    const connection = {
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        return use("openrouter-model-key");
      },
    };
    const models = createOpenRouterModels(connection, async () => [
      {
        id: "author/invalid-reasoning",
        name: "Invalid reasoning",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
        pricing: { prompt: "0.000001", completion: "0.000001" },
        reasoning,
      },
    ]);

    await expect(models.list(operationSignal())).rejects.toThrow(message);
  });
});
