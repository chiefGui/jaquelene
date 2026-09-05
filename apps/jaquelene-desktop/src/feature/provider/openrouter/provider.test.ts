import { Effect } from "effect";
import { HttpClient } from "effect/unstable/http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApiKeyProviderFactory } from "../api-key-provider";
import { openRouterProviderDefinition, openRouterProviderId } from "./provider";

describe("OpenRouter provider", () => {
  it("composes every capability under one provider identity", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-openrouter-provider-"));
    const verify = vi.fn(() =>
      Effect.succeed({
        state: "configured" as const,
        keyLabel: "key...123",
      }),
    );

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const factory = createApiKeyProviderFactory(
              userDataDirectory,
              { ...openRouterProviderDefinition, verifyApiKey: verify },
              {
                encrypt: async (value) => Buffer.from(value),
                decrypt: async (value) => value.toString(),
              },
              HttpClient.make(() => Effect.die("Unexpected HTTP request")),
            );
            const provider = yield* factory.create;

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

            expect(factory.storagePaths).toEqual([
              join(userDataDirectory, `${openRouterProviderId}.json`),
            ]);
            yield* provider.configuration.configure("openrouter-key");
            expect(verify).toHaveBeenCalledWith("openrouter-key", expect.anything());
          }),
        ),
      );
    } finally {
      rmSync(userDataDirectory, { recursive: true, force: true });
    }
  });
});
