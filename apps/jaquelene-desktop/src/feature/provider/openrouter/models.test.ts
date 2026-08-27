import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenRouterModelProvider } from "./models";

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
    const loadModels = vi.fn(async () => [
      {
        id: "author/text-model",
        name: "Text model",
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
      { id: "author/text-model", name: "Text model" },
    ]);
    expect(useCredential).toHaveBeenCalledOnce();
    expect(loadModels).toHaveBeenCalledWith(apiKey);
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
    const provider = createOpenRouterModelProvider(connection, loadModels);

    await expect(provider.listModels()).rejects.toBe(failure);
  });
});
