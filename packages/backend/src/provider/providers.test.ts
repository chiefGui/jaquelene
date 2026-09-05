import { join } from "node:path";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import type { CacheStore, StoredCacheEntry } from "#backend/resource-cache/cache-store";
import { createResourceCache } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
import { StorageCategory } from "#backend/storage/area";
import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderAdapter,
  ProviderConfigureResult,
} from "./provider";
import { ProviderAcquisitionError, ProviderOperationError, ProvidersService } from "./providers";
import { createProviderStorageArea } from "./storage";

const keyLabel = "key...123";

const fixtures = new Set<() => Promise<void>>();

afterEach(async () => {
  await Promise.all([...fixtures].map((close) => close()));
});

async function createTestProviders(
  adapters: readonly ProviderAdapter[],
  cache: Awaited<ReturnType<typeof createTestResourceCache>>,
  context = Context.empty(),
) {
  const runtime = ManagedRuntime.make(
    ProvidersService.layer(
      adapters.map((adapter) => {
        let storagePaths: readonly string[] | null = null;
        if (adapter.configuration.kind === "api-key") {
          storagePaths = [];
        }
        return { id: adapter.descriptor.id, storagePaths, create: Effect.succeed(adapter) };
      }),
    ).pipe(
      Layer.provide(
        Layer.effect(
          ResourceCacheService,
          Effect.acquireRelease(Effect.succeed(cache), (cache) =>
            Effect.promise(() => cache.close()),
          ),
        ),
      ),
      Layer.provide(Layer.succeedContext(context)),
    ),
  );
  const close = () => {
    fixtures.delete(close);
    return runtime.dispose();
  };
  fixtures.add(close);
  try {
    const providers = await runtime.runPromise(ProvidersService);
    return {
      ...providers,
      run: runtime.runPromise,
      runExit: runtime.runPromiseExit,
      fork: runtime.runFork,
      close,
      closeExit: () => {
        fixtures.delete(close);
        return Effect.runPromiseExit(runtime.disposeEffect);
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

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
  subsystem: Awaited<ReturnType<typeof createTestProviders>>,
  providerId: string,
) {
  return (await subsystem.models.getModels(providerId)).models;
}

type ApiKeyAdapter = ProviderAdapter & {
  configuration: Extract<ProviderAdapter["configuration"], { kind: "api-key" }>;
};

function apiKeyProvider(overrides: Partial<ApiKeyAdapter> = {}): ApiKeyAdapter {
  let configuration: ApiKeyProviderConfigurationSnapshot = { state: "unconfigured" };

  return {
    descriptor: { id: "api-key-provider", name: "API-key provider", brandId: "api-key" },
    configuration: {
      kind: "api-key",
      inspect: () => configuration,
      configure: () =>
        Effect.sync(() => {
          const result = { state: "configured", keyLabel } satisfies ProviderConfigureResult;
          configuration = { ...result, revision: "configuration-1" };
          return result;
        }),
      clear: Effect.sync(() => {
        configuration = { state: "unconfigured" };
      }),
    },
    models: {
      list: Effect.succeed([{ id: "maker/model", name: "Model", brandId: "maker" }]),
    },
    generation: {
      generate: () => Effect.succeed({ text: "Generated reply" }),
    },
    ...overrides,
  };
}

function configurationFreeProvider(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    descriptor: { id: "local-provider", name: "Local provider", brandId: "local" },
    configuration: { kind: "none" },
    models: {
      list: Effect.succeed([{ id: "built-in", name: "Built in", brandId: "local" }]),
    },
    generation: {
      generate: () => Effect.succeed({ text: "Local reply" }),
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
  it("preserves acquisition and cleanup failures when a later factory fails", async () => {
    const acquisitionFailure = new Error("Provider creation failed.");
    const cleanupFailure = new Error("Provider cleanup failed.");
    const reportFailure = vi.fn();
    const dispose = vi.fn(() => undefined);
    const unused = vi.fn(() => configurationFreeProvider());
    const runtime = ManagedRuntime.make(
      ProvidersService.layer([
        {
          id: "local-provider",
          storagePaths: null,
          create: Effect.acquireRelease(Effect.sync(configurationFreeProvider), () =>
            Effect.sync(dispose).pipe(Effect.andThen(Effect.die(cleanupFailure))),
          ),
        },
        { id: "failed", storagePaths: null, create: Effect.fail(acquisitionFailure) },
        { id: "unused", storagePaths: null, create: Effect.sync(unused) },
      ]).pipe(Layer.provide(ResourceCacheService.layer({ path: ":memory:", reportFailure }))),
    );
    try {
      const exit = await runtime.runPromiseExit(ProvidersService);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = exit.cause.reasons.find(Cause.isFailReason)?.error;
        expect(failure).toBeInstanceOf(ProviderAcquisitionError);
        expect(failure).toMatchObject({ providerId: "failed", cause: acquisitionFailure });
        expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual(
          [cleanupFailure],
        );
      }
      expect(dispose).toHaveBeenCalledOnce();
      expect(unused).not.toHaveBeenCalled();
    } finally {
      await runtime.dispose();
    }
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("projects distinct provider shapes from one registration", async () => {
    const configured = apiKeyProvider();
    const local = configurationFreeProvider();
    const subsystem = await createTestProviders(
      [configured, local],
      await createTestResourceCache(),
    );

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
      subsystem.run(subsystem.generations.get("local-provider")!.generate(generationRequest())),
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
        list: Effect.sync(() => {
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
        }),
      },
    });
    const capableSubsystem = await createTestProviders([capable], await createTestResourceCache());

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
        list: Effect.sync(() => {
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
        }),
      },
    });
    const inconsistentSubsystem = await createTestProviders(
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
        list: Effect.sync(() => {
          return [
            {
              id: "context-model",
              name: "Context model",
              brandId: "local",
              contextWindowTokens: 128_000,
            },
          ];
        }),
      },
    });
    const capableSubsystem = await createTestProviders([capable], await createTestResourceCache());

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
        list: Effect.sync(() => {
          return [
            {
              id: "invalid-context-model",
              name: "Invalid context model",
              brandId: "local",
              contextWindowTokens: 0,
            },
          ];
        }),
      },
    });
    const invalidSubsystem = await createTestProviders([invalid], await createTestResourceCache());

    await expect(listModels(invalidSubsystem, invalid.descriptor.id)).rejects.toThrow(
      'Provider "invalid" model "invalid-context-model" context window must be a positive safe integer.',
    );
    await invalidSubsystem.close();
  });

  it("configures, exposes, and clears an API-key provider through the subsystem", async () => {
    const adapter = apiKeyProvider();
    const configure = vi.spyOn(adapter.configuration, "configure");
    const clear = vi.fn();
    const clearing = adapter.configuration.clear;
    const trackedAdapter = {
      ...adapter,
      configuration: {
        ...adapter.configuration,
        clear: Effect.sync(clear).pipe(Effect.andThen(clearing)),
      },
    };
    const subsystem = await createTestProviders([trackedAdapter], await createTestResourceCache());

    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      'Provider "api-key-provider" is not configured.',
    );
    await expect(
      subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret")),
    ).resolves.toEqual({ state: "configured", keyLabel: "key...123" });
    expect(configure).toHaveBeenCalledWith("secret");
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
          configure: () =>
            Effect.sync(() => {
              return { state: "configured", keyLabel };
            }),
          clear: Effect.void,
        },
      });
      const subsystem = await createTestProviders([adapter], await createTestResourceCache());

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
          configure: () =>
            Effect.sync(() => {
              return {
                state: "configured",
                ...keyLabelProperty(invalidKeyLabel),
              } as unknown as ProviderConfigureResult;
            }),
          clear: Effect.void,
        },
      });
      const subsystem = await createTestProviders([adapter], await createTestResourceCache());

      await expect(
        subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret")),
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
    const list = vi.fn(() => {
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
        configure: () =>
          Effect.sync(() => {
            configuration = { state: "configured", revision: "configuration-2", keyLabel };
            return { state: "configured", keyLabel };
          }),
        clear: Effect.sync(() => {
          configuration = { state: "unconfigured" };
        }),
      },
      models: { list: Effect.sync(list) },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());

    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "configuration-1" },
    ]);
    await listModels(subsystem, adapter.descriptor.id);
    expect(list).toHaveBeenCalledOnce();

    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"));
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "configuration-2" },
    ]);
    expect(list).toHaveBeenCalledTimes(2);
    await subsystem.close();
  });

  it("inspects configuration once for a cached model lookup", async () => {
    const original = apiKeyProvider();
    const inspect = vi.fn(original.configuration.inspect);
    const list = vi.fn(() => [{ id: "maker/model", name: "Model", brandId: "maker" }]);
    const adapter = apiKeyProvider({
      configuration: { ...original.configuration, inspect },
      models: { list: Effect.sync(list) },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const reference = { providerId: adapter.descriptor.id, modelId: "maker/model" };
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"));
    await subsystem.models.getModel(reference);
    inspect.mockClear();
    list.mockClear();

    await expect(subsystem.models.getModel(reference)).resolves.toEqual({
      id: "maker/model",
      name: "Model",
      brandId: "maker",
    });
    expect(inspect).toHaveBeenCalledOnce();
    expect(list).not.toHaveBeenCalled();
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
        configure: () =>
          Effect.sync(() => {
            configuration = { state: "configured", revision: "configuration-2", keyLabel };
            return { state: "configured", keyLabel };
          }),
        clear: Effect.sync(() => {
          configuration = { state: "unconfigured" };
        }),
      },
      models: { list: Effect.promise(list) },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const obsolete = listModels(subsystem, adapter.descriptor.id);
    await listingStarted.promise;

    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"));
    await expect(obsolete).rejects.toThrow("invalidated");
    firstList.resolve([{ id: "maker/model", name: "Obsolete", brandId: "maker" }]);
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toMatchObject([
      { name: "Current" },
    ]);
    await subsystem.close();
  });

  it("orders configuration changes at the subsystem boundary", async () => {
    const started = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const events: string[] = [];
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: Effect.fnUntraced(function* (apiKey) {
          events.push("configure:start");
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release);
          const result = yield* original.configuration.configure(apiKey);
          events.push("configure:end");
          return result;
        }),
        clear: Effect.sync(() => events.push("clear")).pipe(
          Effect.andThen(original.configuration.clear),
        ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const configuring = subsystem.run(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"),
    );
    await subsystem.run(Deferred.await(started));
    const clearing = subsystem.run(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    await subsystem.run(Deferred.succeed(release, undefined));

    await expect(configuring).resolves.toEqual({ state: "configured", keyLabel });
    await expect(clearing).resolves.toBeUndefined();
    expect(events).toEqual(["configure:start", "configure:end", "clear"]);
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
  });

  it("interrupts active provider work before clearing its configuration", async () => {
    const generationStarted = Deferred.makeUnsafe<void>();
    const generationInterrupted = Deferred.makeUnsafe<void>();
    const clearStarted = Deferred.makeUnsafe<void>();
    const finishClear = Deferred.makeUnsafe<void>();
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        clear: Deferred.succeed(clearStarted, undefined).pipe(
          Effect.andThen(Deferred.await(finishClear)),
          Effect.andThen(original.configuration.clear),
        ),
      },
      generation: {
        generate: () =>
          Deferred.succeed(generationStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(generationInterrupted, undefined)),
          ),
      },
    });
    const unrelated = configurationFreeProvider({
      descriptor: { id: "unrelated", name: "Unrelated", brandId: "unrelated" },
    });
    const subsystem = await createTestProviders(
      [adapter, unrelated],
      await createTestResourceCache(),
    );
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"));
    const generating = subsystem.runExit(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(generationStarted));
    const clearing = subsystem.run(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    await subsystem.run(Deferred.await(generationInterrupted));
    await subsystem.run(Deferred.await(clearStarted));

    const interrupted = await generating;
    expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true);
    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      'Provider "api-key-provider" is disconnecting.',
    );
    await expect(listModels(subsystem, unrelated.descriptor.id)).resolves.toEqual([
      { id: "built-in", name: "Built in", brandId: "local" },
    ]);
    await subsystem.run(Deferred.succeed(finishClear, undefined));
    await clearing;
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
  });

  it("restores provider availability when clearing its configuration fails", async () => {
    const failure = new Error("Credential deletion failed.");
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => ({ state: "configured", revision: "configuration-1", keyLabel }),
        configure: () =>
          Effect.sync(() => {
            return { state: "configured", keyLabel };
          }),
        clear: Effect.fail(failure),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());

    await expect(
      subsystem.run(subsystem.providers.clearConfiguration(adapter.descriptor.id)),
    ).rejects.toMatchObject({ cause: failure });
    await expect(
      subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement")),
    ).resolves.toEqual({ state: "configured", keyLabel });
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toEqual([
      { id: "maker/model", name: "Model", brandId: "maker" },
    ]);
    await subsystem.close();
  });

  it("interrupts each foreign network capability through its native adapter", async () => {
    const signals: AbortSignal[] = [];
    const started = Deferred.makeUnsafe<void>();
    const network = Effect.tryPromise({
      try(signal) {
        signals.push(signal);
        Deferred.doneUnsafe(started, Exit.succeed(undefined));
        return new Promise<never>(() => undefined);
      },
      catch: (cause) => cause,
    });
    const adapter = configurationFreeProvider({
      models: { list: network },
      generation: { generate: () => network },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const generating = subsystem.fork(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(started));
    await subsystem.run(Fiber.interrupt(generating));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(true);

    const listing = listModels(subsystem, adapter.descriptor.id);
    const rejected = expect(listing).rejects.toThrow();
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    await subsystem.close();
    await rejected;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("skips a cancelled queued configuration without blocking the next change", async () => {
    const started = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const configuredKeys: string[] = [];
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: Effect.fnUntraced(function* (apiKey) {
          configuredKeys.push(apiKey);
          if (apiKey === "first") {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }
          return yield* original.configuration.configure(apiKey);
        }),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const first = subsystem.run(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "first"),
    );
    await subsystem.run(Deferred.await(started));
    const cancelled = subsystem.fork(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "cancelled"),
    );
    const last = subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "last"));
    await subsystem.run(Fiber.interrupt(cancelled));

    expect(configuredKeys).toEqual(["first"]);
    await subsystem.run(Deferred.succeed(release, undefined));
    await Promise.all([first, last]);
    expect(configuredKeys).toEqual(["first", "last"]);
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id).state).toBe(
      "configured",
    );
  });

  it("does not let a new configuration overtake an already queued change", async () => {
    const started = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const configuredKeys: string[] = [];
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: Effect.fnUntraced(function* (apiKey) {
          configuredKeys.push(apiKey);
          if (apiKey === "first") {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }
          return yield* original.configuration.configure(apiKey);
        }),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());

    await subsystem.run(
      Effect.gen(function* () {
        const first = yield* Effect.forkChild(
          subsystem.providers.configureApiKey(adapter.descriptor.id, "first"),
          { startImmediately: true },
        );
        yield* Deferred.await(started);
        const second = yield* Effect.forkChild(
          subsystem.providers.configureApiKey(adapter.descriptor.id, "second"),
          { startImmediately: true },
        );
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(first);
        yield* subsystem.providers.configureApiKey(adapter.descriptor.id, "third");
        yield* Fiber.join(second);
      }),
    );

    expect(configuredKeys).toEqual(["first", "second", "third"]);
  });

  it("cancels a queued clear without deleting credentials or leaving admission blocked", async () => {
    const started = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const clear = vi.fn();
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: Effect.fnUntraced(function* (apiKey) {
          if (apiKey === "replacement") {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }
          return yield* original.configuration.configure(apiKey);
        }),
        clear: Effect.sync(clear).pipe(Effect.andThen(original.configuration.clear)),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "initial"));
    const configuring = subsystem.run(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    );
    await subsystem.run(Deferred.await(started));
    const clearing = subsystem.fork(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    const route = subsystem.generations.get(adapter.descriptor.id)!;
    await expect(subsystem.run(route.generate(generationRequest()))).rejects.toThrow(
      "disconnecting",
    );
    await subsystem.run(Fiber.interrupt(clearing));

    expect(clear).not.toHaveBeenCalled();
    await expect(subsystem.run(route.generate(generationRequest()))).resolves.toEqual({
      text: "Generated reply",
    });
    await subsystem.run(Deferred.succeed(release, undefined));
    await configuring;
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "last"));
    expect(clear).not.toHaveBeenCalled();
  });

  it("invalidates committed credentials even when their configuration caller is interrupted", async () => {
    const committed = Deferred.makeUnsafe<void>();
    let configuration: ApiKeyProviderConfigurationSnapshot = {
      state: "configured",
      revision: "initial",
      keyLabel,
    };
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        configure: Effect.fnUntraced(function* () {
          configuration = { state: "configured", revision: "replacement", keyLabel };
          yield* Deferred.succeed(committed, undefined);
          return yield* Effect.never;
        }),
        clear: Effect.sync(() => {
          configuration = { state: "unconfigured" };
        }),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await listModels(subsystem, adapter.descriptor.id);
    const changed = vi.fn();
    subsystem.models.subscribe(changed);
    const configuring = subsystem.fork(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    );
    await subsystem.run(Deferred.await(committed));
    await subsystem.run(Fiber.interrupt(configuring));

    expect(changed).toHaveBeenCalledOnce();
    expect(configuration).toEqual({ state: "configured", revision: "replacement", keyLabel });
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toHaveLength(1);
  });

  it("invalidates deleted credentials even when their clear caller is interrupted", async () => {
    const deleted = Deferred.makeUnsafe<void>();
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        clear: original.configuration.clear.pipe(
          Effect.andThen(Deferred.succeed(deleted, undefined)),
          Effect.andThen(Effect.never),
        ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"));
    await listModels(subsystem, adapter.descriptor.id);
    const changed = vi.fn();
    subsystem.models.subscribe(changed);
    const clearing = subsystem.fork(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    await subsystem.run(Deferred.await(deleted));
    await subsystem.run(Fiber.interrupt(clearing));

    expect(changed).toHaveBeenCalledOnce();
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id).state).toBe(
      "unconfigured",
    );
    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow("not configured");
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"));
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toHaveLength(1);
  });

  it("does not let configuration overtake a clear that is draining active work", async () => {
    const generationStarted = Deferred.makeUnsafe<void>();
    const drainStarted = Deferred.makeUnsafe<void>();
    const releaseDrain = Deferred.makeUnsafe<void>();
    const events: string[] = [];
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: (apiKey) =>
          Effect.sync(() => events.push(apiKey)).pipe(
            Effect.andThen(original.configuration.configure(apiKey)),
          ),
        clear: Effect.sync(() => events.push("clear")).pipe(
          Effect.andThen(original.configuration.clear),
        ),
      },
      generation: {
        generate: () =>
          Deferred.succeed(generationStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(drainStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseDrain)),
              ),
            ),
          ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "initial"));
    const generating = subsystem.runExit(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(generationStarted));
    const clearing = subsystem.run(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    await subsystem.run(Deferred.await(drainStarted));
    const configuring = subsystem.run(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    );
    expect(events).toEqual(["initial"]);
    await subsystem.run(Deferred.succeed(releaseDrain, undefined));
    await Promise.all([generating, clearing, configuring]);

    expect(events).toEqual(["initial", "clear", "replacement"]);
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id).state).toBe(
      "configured",
    );
  });

  it("does not own a caller's continuation after its provider operation finishes", async () => {
    const continued = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const adapter = configurationFreeProvider();
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const route = subsystem.generations.get(adapter.descriptor.id)!;
    const caller = Effect.runFork(
      Effect.gen(function* () {
        yield* route.generate(generationRequest());
        yield* Deferred.succeed(continued, undefined);
        yield* Deferred.await(release);
        return "continued";
      }),
    );
    try {
      await Effect.runPromise(Deferred.await(continued));
      await subsystem.close();
      await Effect.runPromise(Deferred.succeed(release, undefined));
      await expect(Effect.runPromise(Fiber.join(caller))).resolves.toBe("continued");
    } finally {
      await Effect.runPromise(Fiber.interrupt(caller));
    }
  });

  it("reconnects with fresh models after a successful disconnect", async () => {
    let revision = 0;
    let configuration: ApiKeyProviderConfigurationSnapshot = { state: "unconfigured" };
    const list = vi.fn(() => [
      { id: `model-${revision}`, name: "Current model", brandId: "local" },
    ]);
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        configure: () =>
          Effect.sync(() => {
            revision += 1;
            configuration = { state: "configured", revision: String(revision), keyLabel };
            return { state: "configured", keyLabel };
          }),
        clear: Effect.sync(() => {
          configuration = { state: "unconfigured" };
        }),
      },
      models: { list: Effect.sync(list) },
    });
    const cache = await createTestResourceCache();
    const subsystem = await createTestProviders([adapter], cache);

    try {
      await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "first"));
      expect(await listModels(subsystem, adapter.descriptor.id)).toMatchObject([{ id: "model-1" }]);
      await subsystem.run(subsystem.providers.clearConfiguration(adapter.descriptor.id));
      expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id).state).toBe(
        "unconfigured",
      );
      await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow("not configured");

      await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "second"));
      expect(await listModels(subsystem, adapter.descriptor.id)).toMatchObject([{ id: "model-2" }]);
      await expect(
        subsystem.run(
          subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
        ),
      ).resolves.toEqual({ text: "Generated reply" });
      expect(list).toHaveBeenCalledTimes(2);
    } finally {
      await subsystem.close();
    }
  });

  it("loads and refreshes models with the owning application context", async () => {
    const modelName = Context.Reference<string>("test/ProviderCatalogModelName", {
      defaultValue: () => "Default model",
    });
    const adapter = configurationFreeProvider({
      models: {
        list: Effect.map(modelName, (name) => [{ id: "model", name, brandId: "local" }]),
      },
    });
    const subsystem = await createTestProviders(
      [adapter],
      await createTestResourceCache(),
      Context.make(modelName, "Application model"),
    );

    expect(await listModels(subsystem, adapter.descriptor.id)).toEqual([
      { id: "model", name: "Application model", brandId: "local" },
    ]);
    const refreshed = await subsystem.models.refreshModels(adapter.descriptor.id);
    expect(refreshed.models).toEqual([
      { id: "model", name: "Application model", brandId: "local" },
    ]);
  });

  it.each(["configure", "clear"] as const)(
    "reports credential inspection failures as operational failures during %s",
    async (operation) => {
      const storageFailure = new Error("Credential file is unreadable.");
      for (const failingRead of [1, 2, 3]) {
        const original = apiKeyProvider();
        let reads = 0;
        const adapter = apiKeyProvider({
          configuration: {
            ...original.configuration,
            inspect() {
              reads += 1;
              if (reads === failingRead) {
                throw storageFailure;
              }
              return original.configuration.inspect();
            },
          },
        });
        const subsystem = await createTestProviders([adapter], await createTestResourceCache());
        let program = subsystem.providers.clearConfiguration(adapter.descriptor.id);
        if (operation === "configure") {
          program = Effect.asVoid(
            subsystem.providers.configureApiKey(adapter.descriptor.id, "key"),
          );
        }
        const exit = await subsystem.runExit(program);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.filter(Cause.isDieReason)).toEqual([]);
          const failures = exit.cause.reasons.filter(Cause.isFailReason);
          expect(failures).toHaveLength(1);
          expect(failures[0]?.error).toBeInstanceOf(ProviderOperationError);
          expect(failures[0]?.error).toMatchObject({
            providerId: adapter.descriptor.id,
            operation,
            cause: storageFailure,
          });
        }
        await subsystem.close();
      }
    },
  );

  it.each([3, 4])(
    "preserves credential read %s failures around model loading",
    async (failingRead) => {
      const storageFailure = new Error("Credential file is unreadable.");
      const original = apiKeyProvider();
      await Effect.runPromise(original.configuration.configure("key"));
      let reads = 0;
      const adapter = apiKeyProvider({
        configuration: {
          ...original.configuration,
          inspect() {
            reads += 1;
            if (reads === failingRead) {
              throw storageFailure;
            }
            return original.configuration.inspect();
          },
        },
      });
      const subsystem = await createTestProviders([adapter], await createTestResourceCache());

      await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toMatchObject({
        _tag: "ProviderOperationError",
        providerId: adapter.descriptor.id,
        operation: "models",
        cause: storageFailure,
      });
    },
  );

  it("cancels one generation without interrupting another on the same provider", async () => {
    const bothStarted = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const interrupted: string[] = [];
    let active = 0;
    const adapter = configurationFreeProvider({
      generation: {
        generate: Effect.fnUntraced(function* (request) {
          active += 1;
          if (active === 2) {
            yield* Deferred.succeed(bothStarted, undefined);
          }
          yield* Deferred.await(release).pipe(
            Effect.onInterrupt(() => Effect.sync(() => interrupted.push(request.executionId))),
          );
          return { text: "Reply" };
        }),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const route = subsystem.generations.get(adapter.descriptor.id)!;
    const cancelledRequest = generationRequest();
    const cancelled = subsystem.fork(route.generate(cancelledRequest));
    const surviving = subsystem.run(route.generate(generationRequest()));
    await subsystem.run(Deferred.await(bothStarted));
    await subsystem.run(Fiber.interrupt(cancelled));

    expect(interrupted).toEqual([cancelledRequest.executionId]);
    await subsystem.run(Deferred.succeed(release, undefined));
    await expect(surviving).resolves.toEqual({ text: "Reply" });
  });

  it("attempts every disposal in reverse order and preserves each failure", async () => {
    const closed: string[] = [];
    const firstFailure = new Error("First disposal failed.");
    const lastFailure = new Error("Last disposal failed.");
    const runtime = ManagedRuntime.make(
      ProvidersService.layer(
        ["first", "middle", "last"].map((id) => ({
          id,
          storagePaths: null,
          create: Effect.acquireRelease(
            Effect.succeed(
              configurationFreeProvider({ descriptor: { id, name: id, brandId: "local" } }),
            ),
            () =>
              Effect.sync(() => {
                closed.push(id);
                if (id === "first") {
                  throw firstFailure;
                }
                if (id === "last") {
                  throw lastFailure;
                }
              }),
          ),
        })),
      ).pipe(
        Layer.provide(
          ResourceCacheService.layer({
            path: ":memory:",
            reportFailure: () => undefined,
          }),
        ),
      ),
    );
    await runtime.runPromise(ProvidersService);
    const exit = await Effect.runPromiseExit(runtime.disposeEffect);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
        lastFailure,
        firstFailure,
      ]);
    }
    expect(closed).toEqual(["last", "middle", "first"]);
  });

  it("preserves operation cleanup failures when its caller is interrupted", async () => {
    const started = Deferred.makeUnsafe<void>();
    const cleanupFailure = new Error("Request cleanup failed.");
    const adapter = configurationFreeProvider({
      generation: {
        generate: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.die(cleanupFailure)),
          ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const caller = subsystem.fork(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(started));
    await subsystem.run(Fiber.interrupt(caller));
    const exit = await subsystem.run(Fiber.await(caller));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
        cleanupFailure,
      ]);
    }
  });

  it("does not delete credentials when draining a request fails", async () => {
    const started = Deferred.makeUnsafe<void>();
    const cleanupFailure = new Error("Request cleanup failed.");
    const clear = vi.fn();
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        clear: Effect.sync(clear).pipe(Effect.andThen(original.configuration.clear)),
      },
      generation: {
        generate: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.die(cleanupFailure)),
          ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "secret"));
    const generating = subsystem.runExit(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(started));
    const clearing = await subsystem.runExit(
      subsystem.providers.clearConfiguration(adapter.descriptor.id),
    );
    await generating;

    expect(Exit.isFailure(clearing)).toBe(true);
    if (Exit.isFailure(clearing)) {
      expect(
        clearing.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
      ).toEqual([cleanupFailure]);
    }
    expect(clear).not.toHaveBeenCalled();
    await expect(listModels(subsystem, adapter.descriptor.id)).resolves.toHaveLength(1);
  });

  it("preserves a drain failure when a queued clear is interrupted", async () => {
    const configurationStarted = Deferred.makeUnsafe<void>();
    const releaseConfiguration = Deferred.makeUnsafe<void>();
    const generationStarted = Deferred.makeUnsafe<void>();
    const drainStarted = Deferred.makeUnsafe<void>();
    const releaseDrain = Deferred.makeUnsafe<void>();
    const cleanupFailure = new Error("Request cleanup failed while clear was queued.");
    const clear = vi.fn();
    const original = apiKeyProvider();
    const adapter = apiKeyProvider({
      configuration: {
        ...original.configuration,
        configure: Effect.fnUntraced(function* (apiKey) {
          if (apiKey === "replacement") {
            yield* Deferred.succeed(configurationStarted, undefined);
            yield* Deferred.await(releaseConfiguration);
          }
          return yield* original.configuration.configure(apiKey);
        }),
        clear: Effect.sync(clear).pipe(Effect.andThen(original.configuration.clear)),
      },
      generation: {
        generate: () =>
          Deferred.succeed(generationStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(drainStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseDrain)),
                Effect.andThen(Effect.die(cleanupFailure)),
              ),
            ),
          ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    await subsystem.run(subsystem.providers.configureApiKey(adapter.descriptor.id, "initial"));
    const generating = subsystem.runExit(
      subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
    );
    await subsystem.run(Deferred.await(generationStarted));
    const configuring = subsystem.run(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    );
    await subsystem.run(Deferred.await(configurationStarted));
    const clearing = subsystem.fork(subsystem.providers.clearConfiguration(adapter.descriptor.id));
    await subsystem.run(Deferred.await(drainStarted));
    const cancelling = subsystem.run(Fiber.interrupt(clearing));
    await subsystem.run(Deferred.succeed(releaseDrain, undefined));
    await cancelling;
    const exit = await subsystem.run(Fiber.await(clearing));
    await subsystem.run(Deferred.succeed(releaseConfiguration, undefined));
    await Promise.all([generating, configuring]);

    expect(clear).not.toHaveBeenCalled();
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
        cleanupFailure,
      ]);
    }
  });

  it("interrupts all providers before awaiting slow cleanup and preserves drain failures", async () => {
    const firstStarted = Deferred.makeUnsafe<void>();
    const secondStarted = Deferred.makeUnsafe<void>();
    const firstInterrupted = Deferred.makeUnsafe<void>();
    const secondInterrupted = Deferred.makeUnsafe<void>();
    const release = Deferred.makeUnsafe<void>();
    const firstFailure = new Error("First request cleanup failed.");
    const secondFailure = new Error("Second request cleanup failed.");
    const first = configurationFreeProvider({
      descriptor: { id: "first", name: "First", brandId: "local" },
      generation: {
        generate: () =>
          Deferred.succeed(firstStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(firstInterrupted, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(Effect.die(firstFailure)),
              ),
            ),
          ),
      },
    });
    const second = configurationFreeProvider({
      descriptor: { id: "second", name: "Second", brandId: "local" },
      generation: {
        generate: () =>
          Deferred.succeed(secondStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(secondInterrupted, undefined).pipe(
                Effect.andThen(Effect.die(secondFailure)),
              ),
            ),
          ),
      },
    });
    const subsystem = await createTestProviders([first, second], await createTestResourceCache());
    const generations = [first, second].map((adapter) =>
      Effect.runPromiseExit(
        subsystem.generations.get(adapter.descriptor.id)!.generate(generationRequest()),
      ),
    );
    await subsystem.run(Deferred.await(firstStarted));
    await subsystem.run(Deferred.await(secondStarted));
    const closing = subsystem.closeExit();
    await Effect.runPromise(Deferred.await(firstInterrupted));
    await Effect.runPromise(Deferred.await(secondInterrupted));
    await Effect.runPromise(Deferred.succeed(release, undefined));
    const exit = await closing;
    await Promise.all(generations);

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
        firstFailure,
        secondFailure,
      ]);
    }
  });

  it("rejects new work and interrupts active work during close", async () => {
    const started = Deferred.makeUnsafe<void>();
    const interrupted = vi.fn();
    const adapter = configurationFreeProvider({
      generation: {
        generate: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.sync(interrupted)),
          ),
      },
    });
    const subsystem = await createTestProviders([adapter], await createTestResourceCache());
    const route = subsystem.generations.get(adapter.descriptor.id)!;
    const generating = subsystem.runExit(route.generate(generationRequest()));
    await subsystem.run(Deferred.await(started));
    await subsystem.close();
    const exit = await generating;

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    expect(interrupted).toHaveBeenCalledOnce();
    await subsystem.close();
    await expect(listModels(subsystem, adapter.descriptor.id)).rejects.toThrow(
      "Providers are closed.",
    );
    await expect(Effect.runPromise(route.generate(generationRequest()))).rejects.toThrow(
      "Providers are closed.",
    );
  });

  it("rejects duplicate identities without requiring provider-specific methods", async () => {
    const provider = configurationFreeProvider();
    const cache = await createTestResourceCache();

    await expect(createTestProviders([provider, provider], cache)).rejects.toThrow(
      'Provider "local-provider" is registered more than once.',
    );
    expect(Object.keys(provider)).toEqual(["descriptor", "configuration", "models", "generation"]);
    expect(provider.configuration).toEqual({ kind: "none" });
  });
});
