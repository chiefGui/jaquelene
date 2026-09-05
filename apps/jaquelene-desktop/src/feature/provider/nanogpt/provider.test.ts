import { Effect } from "effect";
import { HttpClient } from "effect/unstable/http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApiKeyProviderFactory } from "../api-key-provider";
import { nanoGptProviderDefinition, nanoGptProviderId } from "./provider";

describe("NanoGPT provider", () => {
  it("composes every capability under one provider identity", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-nanogpt-provider-"));
    const verify = vi.fn(() => Effect.succeed({ state: "configured" as const }));
    const client = HttpClient.make(() => Effect.die("Unexpected HTTP request."));

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const factory = createApiKeyProviderFactory(
              userDataDirectory,
              { ...nanoGptProviderDefinition, verifyApiKey: verify },
              {
                encrypt: async (value) => Buffer.from(value),
                decrypt: async (value) => value.toString(),
              },
              client,
            );
            const provider = yield* factory.create;

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

            expect(factory.storagePaths).toEqual([
              join(userDataDirectory, `${nanoGptProviderId}.json`),
            ]);
            const apiKey = "sk-nano-123e4567-e89b-12d3-a456-426614174000";
            expect(yield* provider.configuration.configure(apiKey)).toEqual({
              state: "configured",
              keyLabel: "sk-nano-...4000",
            });
            expect(verify).toHaveBeenCalledWith(apiKey, client);
            expect(provider.configuration.inspect()).toEqual({
              state: "configured",
              revision: expect.any(String),
              keyLabel: "sk-nano-...4000",
            });
          }),
        ),
      );
    } finally {
      rmSync(userDataDirectory, { recursive: true, force: true });
    }
  });
});
