import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { createNanoGptProvider, nanoGptProviderId } from "./provider";

describe("NanoGPT provider", () => {
  it("composes every capability under one provider identity", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-nanogpt-provider-"));
    const verify = vi.fn(async () => ({ state: "configured" as const }));

    try {
      const provider = createNanoGptProvider(userDataDirectory, {
        encrypt: async (value) => Buffer.from(value),
        decrypt: async (value) => value.toString(),
        verify,
      });

      expect(provider.descriptor).toEqual({
        id: nanoGptProviderId,
        name: "NanoGPT",
        brandId: nanoGptProviderId,
      });
      expect(Object.keys(provider)).toEqual([
        "descriptor",
        "configuration",
        "models",
        "generation",
      ]);
      expect(provider.configuration.kind).toBe("api-key");

      if (provider.configuration.kind !== "api-key") {
        throw new Error("NanoGPT must use API-key configuration.");
      }

      expect(provider.configuration.storagePaths).toEqual([
        join(userDataDirectory, `${nanoGptProviderId}.json`),
      ]);
      await provider.configuration.configure("nanogpt-key", new AbortController().signal);
      expect(verify).toHaveBeenCalledWith("nanogpt-key", expect.any(AbortSignal));
      expect(provider.configuration.inspect()).toEqual({
        state: "configured",
        revision: expect.any(String),
      });
    } finally {
      rmSync(userDataDirectory, { recursive: true, force: true });
    }
  });
});
