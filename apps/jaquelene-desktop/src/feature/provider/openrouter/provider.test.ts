import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApiKeyProviderFactory } from "../api-key-provider";
import { openRouterProviderDefinition, openRouterProviderId } from "./provider";

describe("OpenRouter provider", () => {
  it("composes every capability under one provider identity", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-openrouter-provider-"));
    const verify = vi.fn(async () => ({
      state: "configured" as const,
      keyLabel: "key...123",
    }));

    try {
      const factory = createApiKeyProviderFactory(
        userDataDirectory,
        { ...openRouterProviderDefinition, verifyApiKey: verify },
        {
          encrypt: async (value) => Buffer.from(value),
          decrypt: async (value) => value.toString(),
        },
      );
      const provider = await factory.create(new AbortController().signal);

      expect(provider.descriptor).toEqual({
        id: openRouterProviderId,
        name: "OpenRouter",
        brandId: openRouterProviderId,
      });
      expect(Object.keys(provider)).toEqual([
        "descriptor",
        "configuration",
        "models",
        "generation",
      ]);
      expect(provider.configuration.kind).toBe("api-key");

      if (provider.configuration.kind !== "api-key") {
        throw new Error("OpenRouter must use API-key configuration.");
      }

      expect(provider.configuration.storagePaths).toEqual([
        join(userDataDirectory, `${openRouterProviderId}.json`),
      ]);
      expect(factory.storagePaths).toEqual(provider.configuration.storagePaths);
      await provider.configuration.configure("openrouter-key", new AbortController().signal);
      expect(verify).toHaveBeenCalledWith("openrouter-key", expect.any(AbortSignal));
    } finally {
      rmSync(userDataDirectory, { recursive: true, force: true });
    }
  });
});
