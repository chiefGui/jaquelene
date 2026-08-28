import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterModelProvider } from "./models";

describe("OpenRouter model provider", () => {
  it("lists text models available to the connected API key", async () => {
    const apiKey = "openrouter-model-key";
    const useCredential = vi.fn();
    const connection = {
      getStatus: async () => ({ state: "connected", keyLabel: "Jaquelene" }) as const,
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        useCredential();
        return use(apiKey);
      },
    };
    const loadModels = vi.fn(async () => [
      {
        id: "meta-llama/text-model",
        name: "Meta: Text model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
      },
      {
        id: "new-lab/research-model",
        name: "New Lab: Research model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
      },
      {
        id: "x-ai/grok-model",
        name: "SpaceXAI: Grok model",
        architecture: { inputModalities: ["text"], outputModalities: ["text"] },
      },
      {
        id: "author/image-model",
        name: "Image model",
        architecture: { inputModalities: ["text"], outputModalities: ["image"] },
      },
    ]);
    const provider = createOpenRouterModelProvider(connection, loadModels);

    await expect(provider.listModels()).resolves.toEqual([
      { id: "meta-llama/text-model", name: "Text model", brandId: "meta" },
      { id: "new-lab/research-model", name: "Research model", brandId: "new-lab" },
      { id: "x-ai/grok-model", name: "Grok model", brandId: "x-ai" },
    ]);
    expect(provider.brandId).toBe("openrouter");
    expect(useCredential).toHaveBeenCalledOnce();
    expect(loadModels).toHaveBeenCalledWith(apiKey);
    await expect(provider.isConnected()).resolves.toBe(true);
  });

  it("preserves catalog failures", async () => {
    const failure = new Error("Catalog unavailable");
    const connection = {
      getStatus: async () => ({ state: "connected", keyLabel: "Jaquelene" }) as const,
      async withApiKey<Result>(use: (value: string) => Promise<Result>) {
        return use("openrouter-failing-key");
      },
    };
    const loadModels = vi.fn(async () => {
      throw failure;
    });
    const provider = createOpenRouterModelProvider(connection, loadModels);

    await expect(provider.listModels()).rejects.toBe(failure);
  });
});
