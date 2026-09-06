import { Effect } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApiKeyProviderFactory } from "./api-key-provider";
import { httpClient } from "./http-test-helpers";
import { nanoGptProviderDefinition } from "./nanogpt/provider";
import { openRouterProviderDefinition } from "./openrouter/provider";

describe("API-key provider factory", () => {
  it.each([
    {
      definition: openRouterProviderDefinition,
      apiKey: "sk-or-v1-test-secret-1234",
      response: { data: { label: "key...1234" } },
      keyLabel: "key...1234",
      header: "authorization",
      prefix: "Bearer ",
    },
    {
      definition: nanoGptProviderDefinition,
      apiKey: "sk-nano-123e4567-e89b-12d3-a456-426614174000",
      response: { usd_balance: "0.50", nano_balance: "1.25" },
      keyLabel: "sk-nano-...4000",
      header: "x-api-key",
      prefix: "",
    },
  ])(
    "connects $definition.descriptor.name through the supplied HTTP client",
    async ({ definition, apiKey, response, keyLabel, header, prefix }) => {
      const directory = mkdtempSync(join(tmpdir(), "jaquelene-provider-"));
      const request = vi.fn<typeof fetch>(async () => Response.json(response));
      const factory = createApiKeyProviderFactory(
        directory,
        definition,
        {
          encrypt: async (value) => Buffer.from(value),
          decrypt: async (value) => value.toString(),
        },
        httpClient(request),
      );

      try {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const provider = yield* factory.create;
              expect(provider.descriptor).toEqual(definition.descriptor);
              expect(factory.storagePaths).toEqual([join(directory, `${factory.id}.json`)]);
              if (provider.configuration.kind !== "api-key") {
                throw new Error("Expected API-key configuration.");
              }
              expect(yield* provider.configuration.configure(apiKey)).toEqual({
                state: "configured",
                keyLabel,
              });
              expect(provider.configuration.inspect()).toMatchObject({
                state: "configured",
                keyLabel,
              });
              expect(request).toHaveBeenCalledOnce();
              expect(new Headers(request.mock.calls[0]?.[1]?.headers).get(header)).toBe(
                `${prefix}${apiKey}`,
              );
            }),
          ),
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
