import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import type { CacheStore, StoredCacheEntry } from "#backend/resource-cache/cache-store";
import { createResourceCache } from "#backend/resource-cache/resource-cache";
import { StorageCategory } from "#backend/storage/area";
import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderAdapter,
  ProviderConfigureResult,
} from "./provider";
import { ProvidersService, createProviderSubsystem } from "./providers";
import { createProviderStorageArea } from "./storage";

const keyLabel = "key...123";

function keyLabelProperty(value: string | undefined) {
  if (value === undefined) {
    return {};
  }

  return { keyLabel: value };
}

async function createTestResourceCache() {
  const entries = new Map<string, StoredCacheEntry>();
  let revision = 0;
  const store: CacheStore = {
    async read(address) {
      return entries.get(JSON.stringify(address));
    },
    async write(entry) {
      entries.set(
        JSON.stringify({ namespace: entry.namespace, scope: entry.scope, key: entry.key }),
        entry,
      );
      revision = Math.max(revision, entry.revision);
    },
    async delete(selector, nextRevision) {
      for (const [key, entry] of entries) {
        if (
          (selector.namespace === undefined || selector.namespace === entry.namespace) &&
          (selector.scope === undefined || selector.scope === entry.scope) &&
          (selector.key === undefined || selector.key === entry.key)
        ) {
          entries.delete(key);
        }
      }
      revision = Math.max(revision, nextRevision);
    },
    async clear(nextRevision) {
      entries.clear();
      revision = Math.max(revision, nextRevision);
    },
    async inspect() {
      return {
        entries: entries.size,
        logicalBytes: [...entries.values()].reduce((total, entry) => total + entry.payloadBytes, 0),
        revision,
      };
    },
    async close() {},
  };

  return createResourceCache(store, {
    maxHotEntries: 16,
    maxHotBytes: 1_024 * 1_024,
    reportFailure: () => undefined,
  });
}

async function listModels(
  subsystem: ReturnType<typeof createProviderSubsystem>,
  providerId: string,
) {
  return (await subsystem.models.getModels(providerId)).models;
}

function apiKeyProvider(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter & {
  configuration: Extract<ProviderAdapter["configuration"], { kind: "api-key" }>;
} {
  let configuration: ApiKeyProviderConfigurationSnapshot = { state: "unconfigured" };

  return {
    descriptor: { id: "api-key-provider", name: "API-key provider", brandId: "api-key" },
    configuration: {
      kind: "api-key",
      inspect: () => configuration,
      async configure(_apiKey, signal) {
        signal.throwIfAborted();
        const result = {
          state: "configured",
          keyLabel,
        } satisfies ProviderConfigureResult;
        configuration = { ...result, revision: "configuration-1" };
        return result;
      },
      async clear() {
        configuration = { state: "unconfigured" };
      },
    },
    models: {
      async list(signal) {
        signal.throwIfAborted();
        return [{ id: "maker/model", name: "Model", brandId: "maker" }];
      },
    },
    generation: {
      async generate(_request, signal) {
        signal.throwIfAborted();
        return { text: "Generated reply" };
      },
    },
    ...overrides,
  } as ProviderAdapter & {
    configuration: Extract<ProviderAdapter["configuration"], { kind: "api-key" }>;
  };
}

function configurationFreeProvider(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    descriptor: { id: "local-provider", name: "Local provider", brandId: "local" },
    configuration: { kind: "none" },
    models: {
      async list(signal) {
        signal.throwIfAborted();
        return [{ id: "built-in", name: "Built in", brandId: "local" }];
      },
    },
    generation: {
      async generate(_request, signal) {
        signal.throwIfAborted();
        return { text: "Local reply" };
      },
    },
    ...overrides,
  };
}

function generationRequest() {
  return {
    executionId: ids.generation.create(),
    groupId: ids.thread.create(),
    modelId: "maker/model",
    input: {
      instructions: [],
      dialogue: [{ messageId: ids.message.create(), role: "user" as const, content: "Hello" }],
    },
  };
}

describe("provider subsystem", () => {
  it("projects distinct provider shapes from one registration", async () => {
    const configured = apiKeyProvider();
    const local = configurationFreeProvider();
    const subsystem = createProviderSubsystem([configured, local], await createTestResourceCache());

    expect(subsystem.providers.list()).toEqual([
      {
        id: "api-key-provider",
        name: "API-key provider",
        brandId: "api-key",
        configuration: { kind: "api-key", state: "unconfigured" },
      },
      {
        id: "local-provider",
        name: "Local provider",
        brandId: "local",
        configuration: { kind: "none", state: "configured" },
      },
    ]);
    expect(subsystem.models.listProviders()).toEqual([{ id: "local-provider", brandId: "local" }]);
    await expect(listModels(subsystem, "local-provider")).resolves.toEqual([
      { id: "built-in", name: "Built in", brandId: "local" },
    ]);
    await expect(
      subsystem.generations.get("local-provider")?.generate(generationRequest()),
    ).resolves.toEqual({ text: "Local reply" });
    const paths = [join(process.cwd(), "api-key-provider.json")];
    const area = createProviderStorageArea(configured.descriptor.id, paths);
    expect(area).toMatchObject({
      id: "provider:api-key-provider",
      category: StorageCategory.AppData,
      paths,
    });
    expect(Effect.isEffect(area.delete)).toBe(true);
    await subsystem.close();
  });

  it("preserves valid reasoning capabilities and rejects inconsistent ones", async () => {
    const capable = configurationFreeProvider({
      models: {
        async list() {
          return [
            {
              id: "reasoning-model",
              name: "Reasoning model",
              brandId: "local",
              reasoning: {
                defaultPreset: "high" as const,
                supportedPresets: ["high", "medium", "low"] as const,
              },
            },
          ];
        },
      },
    });
    const capableSubsystem = createProviderSubsystem([capable], await createTestResourceCache());

    await expect(listModels(capableSubsystem, capable.descriptor.id)).resolves.toEqual([
      {
        id: "reasoning-model",
        name: "Reasoning model",
        brandId: "local",
        reasoning: {
          defaultPreset: "high",
          supportedPresets: ["high", "medium", "low"],
        },
      },
    ]);
    await capableSubsystem.close();

    const inconsistent = configurationFreeProvider({
      descriptor: { id: "inconsistent", name: "Inconsistent", brandId: "local" },
      models: {
        async list() {
          return [
            {
              id: "invalid-reasoning-model",
              name: "Invalid reasoning model",
              brandId: "local",
              reasoning: {
                defaultPreset: "high" as const,
                supportedPresets: ["high", "on"] as const,
              },
            },
          ];
        },
      },
    });
    const inconsistentSubsystem = createProviderSubsystem(
      [inconsistent],
      await createTestResourceCache(),
    );

    await expect(listModels(inconsistentSubsystem, inconsistent.descriptor.id)).rejects.toThrow(
      'Provider "inconsistent" model "invalid-reasoning-model" reasoning cannot mix binary and graded reasoning presets.',
    );
    await inconsistentSubsystem.close();
  });

  it("preserves valid context windows and rejects invalid ones", async () => {
    const capable = configurationFreeProvider({
      models: {
        async list() {
          return [
            {
              id: "context-model",
              name: "Context model",
              brandId: "local",
              contextWindowTokens: 128_000,
            },
          ];
        },
      },
    });
    const capableSubsystem = createProviderSubsystem([capable], await createTestResourceCache());

    await expect(listModels(capableSubsystem, capable.descriptor.id)).resolves.toEqual([
      {
        id: "context-model",
        name: "Context model",
        brandId: "local",
        contextWindowTokens: 128_000,
      },
    ]);
    await capableSubsystem.close();

    const invalid = configurationFreeProvider({
      descriptor: { id: "invalid", name: "Invalid", brandId: "local" },
      models: {
        async list() {
          return [
            {
              id: "invalid-context-model",
              name: "Invalid context model",
              brandId: "local",
              contextWindowTokens: 0,
            },
          ];
        },
      },
    });
    const invalidSubsystem = createProviderSubsystem([invalid], await createTestResourceCache());

    await expect(listModels(invalidSubsystem, invalid.descriptor.id)).rejects.toThrow(
      'Provider "invalid" model "invalid-context-model" context window must be a positive safe integer.',
    );
    await invalidSubsystem.close();
  });

  it("configures, exposes, and clears an API-key provider through the subsystem", async () => {
    const adapter = apiKeyProvider();
    const configure = vi.spyOn(adapter.configuration, "configure");
    const clear = vi.spyOn(adapter.configuration, "clear");
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      'Provider "api-key-provider" is not configured.',
    );
    await expect(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"),
    ).resolves.toEqual({ state: "configured", keyLabel: "key...123" });
    expect(configure).toHaveBeenCalledWith("secret", expect.any(AbortSignal));
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "configured",
      keyLabel: "key...123",
    });
    expect(subsystem.models.listProviders()).toEqual([
      { id: "api-key-provider", brandId: "api-key" },
    ]);

    const area = createProviderStorageArea(adapter.descriptor.id, []);
    await Effect.runPromise(area.delete.pipe(Effect.provideService(ProvidersService, subsystem)));
    expect(clear).toHaveBeenCalledOnce();
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await subsystem.close();
  });

  it.each([undefined, " "])(
    "rejects configured API-key state with the invalid label %j",
    async (invalidKeyLabel) => {
      const configuration = {
        state: "configured",
        revision: "configuration-1",
        ...keyLabelProperty(invalidKeyLabel),
      } as unknown as ApiKeyProviderConfigurationSnapshot;
      const adapter = apiKeyProvider({
        configuration: {
          kind: "api-key",
          inspect: () => configuration,
          async configure() {
            return { state: "configured", keyLabel };
          },
          async clear() {},
        },
      });
      const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

      expect(() => subsystem.providers.list()).toThrow(
        'Provider "api-key-provider" returned an invalid API-key label.',
      );
      await subsystem.close();
    },
  );

  it.each([undefined, " "])(
    "rejects configured API-key results with the invalid label %j",
    async (invalidKeyLabel) => {
      const adapter = apiKeyProvider({
        configuration: {
          kind: "api-key",
          inspect: () => ({ state: "unconfigured" }),
          async configure() {
            return {
              state: "configured",
              ...keyLabelProperty(invalidKeyLabel),
            } as unknown as ProviderConfigureResult;
          },
          async clear() {},
        },
      });
      const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

      await expect(
        subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"),
      ).rejects.toThrow('Provider "api-key-provider" returned an invalid API-key label.');
      await subsystem.close();
    },
  );

  it("isolates model snapshots across provider configuration revisions", async () => {
    let configuration: ApiKeyProviderConfigurationSnapshot = {
      state: "configured",
      revision: "configuration-1",
      keyLabel,
    };
    const list = vi.fn(async () => {
      let name = "unconfigured";

      if (configuration.state === "configured") {
        name = configuration.revision;
      }

      return [{ id: "maker/model", name, brandId: "maker" }];
    });
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        async configure() {
          configuration = { state: "configured", revision: "configuration-2", keyLabel };
          return { state: "configured", keyLabel };
        },
        async clear() {
          configuration = { state: "unconfigured" };
        },
      },
      models: { list },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "configuration-1" },
    ]);
    await listModels(subsystem, adapter.descriptor.id);
    expect(list).toHaveBeenCalledOnce();

    await subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement");
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "configuration-2" },
    ]);
    expect(list).toHaveBeenCalledTimes(2);
    await subsystem.close();
  });

  it("cannot commit a model refresh from a replaced provider configuration", async () => {
    let configuration: ApiKeyProviderConfigurationSnapshot = {
      state: "configured",
      revision: "configuration-1",
      keyLabel,
    };
    const firstList =
      Promise.withResolvers<readonly [{ id: string; name: string; brandId: string }]>();
    const listingStarted = Promise.withResolvers<void>();
    const list = vi
      .fn()
      .mockImplementationOnce(() => {
        listingStarted.resolve();
        return firstList.promise;
      })
      .mockResolvedValueOnce([{ id: "maker/model", name: "Current", brandId: "maker" }] as const);
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        async configure() {
          configuration = { state: "configured", revision: "configuration-2", keyLabel };
          return { state: "configured", keyLabel };
        },
        async clear() {
          configuration = { state: "unconfigured" };
        },
      },
      models: { list },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());
    const obsolete = listModels(subsystem, adapter.descriptor.id);
    await listingStarted.promise;

    await subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement");
    await expect(obsolete).rejects.toThrow("invalidated");
    firstList.resolve([{ id: "maker/model", name: "Obsolete", brandId: "maker" }]);
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "Current" },
    ]);
    await subsystem.close();
  });

  it("orders configuration changes at the subsystem boundary", async () => {
    let configuration: ApiKeyProviderConfigurationSnapshot = { state: "unconfigured" };
    const finishConfiguration = Promise.withResolvers<void>();
    const events: string[] = [];
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        async configure(_apiKey, signal) {
          events.push("configure:start");
          await finishConfiguration.promise;
          signal.throwIfAborted();
          configuration = { state: "configured", revision: "configuration-1", keyLabel };
          events.push("configure:end");
          return { state: "configured", keyLabel };
        },
        async clear() {
          events.push("clear");
          configuration = { state: "unconfigured" };
        },
      },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());
    const configuring = subsystem.providers.configureApiKey(adapter.descriptor.id, "secret");
    const clearing = subsystem.providers.clearConfiguration(adapter.descriptor.id);

    await vi.waitFor(() => expect(events).toEqual(["configure:start"]));
    finishConfiguration.resolve();

    await expect(configuring).resolves.toEqual({ state: "configured", keyLabel });
    await expect(clearing).resolves.toBeUndefined();
    expect(events).toEqual(["configure:start", "configure:end", "clear"]);
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await subsystem.close();
  });

  it("interrupts active provider work before clearing its configuration", async () => {
    let configuration: ApiKeyProviderConfigurationSnapshot = {
      state: "configured",
      revision: "configuration-1",
      keyLabel,
    };
    let activeSignal: AbortSignal | undefined;
    const modelListingStarted = Promise.withResolvers<void>();
    const clearStarted = Promise.withResolvers<void>();
    const finishClear = Promise.withResolvers<void>();
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        async configure() {
          return { state: "configured", keyLabel };
        },
        async clear() {
          clearStarted.resolve();
          await finishClear.promise;
          configuration = { state: "unconfigured" };
        },
      },
      models: {
        list(signal) {
          activeSignal = signal;
          modelListingStarted.resolve();
          return new Promise(() => undefined);
        },
      },
    });
    const unrelated = configurationFreeProvider({
      descriptor: { id: "unrelated", name: "Unrelated", brandId: "unrelated" },
    });
    const subsystem = createProviderSubsystem(
      [adapter, unrelated],
      await createTestResourceCache(),
    );
    const listing = listModels(subsystem, adapter.descriptor.id);
    await modelListingStarted.promise;

    const clearing = subsystem.providers.clearConfiguration(adapter.descriptor.id);

    await expect(listing).rejects.toThrow('Provider "api-key-provider" is disconnecting.');
    await clearStarted.promise;
    expect(activeSignal?.aborted).toBe(true);
    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      'Provider "api-key-provider" is disconnecting.',
    );
    await expect(listModels(subsystem, unrelated.descriptor.id)).resolves.toEqual([
      { id: "built-in", name: "Built in", brandId: "local" },
    ]);

    finishClear.resolve();
    await clearing;
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await subsystem.close();
  });

  it("restores provider availability when clearing its configuration fails", async () => {
    const failure = new Error("Credential deletion failed.");
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => ({ state: "configured", revision: "configuration-1", keyLabel }),
        async configure() {
          return { state: "configured", keyLabel };
        },
        async clear() {
          throw failure;
        },
      },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

    await expect(subsystem.providers.clearConfiguration(adapter.descriptor.id)).rejects.toBe(
      failure,
    );
    await expect(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    ).resolves.toEqual({ state: "configured", keyLabel });
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toEqual([
      { id: "maker/model", name: "Model", brandId: "maker" },
    ]);
    await subsystem.close();
  });

  it("passes mandatory cancellation to every network capability", async () => {
    const modelSignal = vi.fn();
    const generationSignal = vi.fn();
    const adapter = configurationFreeProvider({
      models: {
        async list(signal) {
          modelSignal(signal);
          return [];
        },
      },
      generation: {
        async generate(_request, signal) {
          generationSignal(signal);
          return { text: "Reply" };
        },
      },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());

    await listModels(subsystem, adapter.descriptor.id);
    await subsystem.generations.get(adapter.descriptor.id)?.generate(generationRequest());
    expect(modelSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(generationSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    await subsystem.close();
  });

  it("rejects new work and interrupts active work during close", async () => {
    let activeSignal: AbortSignal | undefined;
    const started = Promise.withResolvers<void>();
    const adapter = configurationFreeProvider({
      models: {
        list(signal) {
          activeSignal = signal;
          started.resolve();
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    const subsystem = createProviderSubsystem([adapter], await createTestResourceCache());
    const listing = listModels(subsystem, adapter.descriptor.id);
    await started.promise;

    const firstClose = subsystem.close();

    await expect(listing).rejects.toThrow("Providers are closing.");
    await firstClose;
    expect(subsystem.close()).toBe(firstClose);
    expect(activeSignal?.aborted).toBe(true);
    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      "Providers are closed.",
    );
  });

  it("rejects duplicate identities without requiring provider-specific methods", async () => {
    const provider = configurationFreeProvider();
    const cache = await createTestResourceCache();

    expect(() => createProviderSubsystem([provider, provider], cache)).toThrow(
      'Provider "local-provider" is registered more than once.',
    );
    expect(Object.keys(provider)).toEqual(["descriptor", "configuration", "models", "generation"]);
    expect(provider.configuration).toEqual({ kind: "none" });
  });
});
