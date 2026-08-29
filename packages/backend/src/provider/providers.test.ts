import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import { StorageCategory } from "#backend/storage/storage";
import type {
  ApiKeyProviderConfiguration,
  ProviderAdapter,
  ProviderConfigureResult,
} from "./provider";
import { createProviderSubsystem } from "./providers";

function apiKeyProvider(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter & {
  configuration: Extract<ProviderAdapter["configuration"], { kind: "api-key" }>;
} {
  let configuration: ApiKeyProviderConfiguration = { state: "unconfigured" };

  return {
    descriptor: { id: "api-key-provider", name: "API-key provider", brandId: "api-key" },
    configuration: {
      kind: "api-key",
      inspect: () => configuration,
      async configure(_apiKey, signal) {
        signal.throwIfAborted();
        const result = {
          state: "configured",
          keyLabel: "key...123",
        } satisfies ProviderConfigureResult;
        configuration = result;
        return result;
      },
      async clear() {
        configuration = { state: "unconfigured" };
      },
      storagePaths: [join(process.cwd(), "api-key-provider.json")],
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
    generationId: ids.generation.create(),
    threadId: ids.thread.create(),
    modelId: "maker/model",
    messages: [{ role: "user" as const, content: "Hello" }],
  };
}

describe("provider subsystem", () => {
  it("projects distinct provider shapes from one registration", async () => {
    const configured = apiKeyProvider();
    const local = configurationFreeProvider();
    const subsystem = createProviderSubsystem([configured, local]);

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
    await expect(subsystem.models.listModels("local-provider")).resolves.toEqual([
      { id: "built-in", name: "Built in", brandId: "local" },
    ]);
    await expect(
      subsystem.generations.get("local-provider")?.generate(generationRequest()),
    ).resolves.toEqual({ text: "Local reply" });
    expect(subsystem.storageAreas).toEqual([
      {
        id: "provider:api-key-provider",
        category: StorageCategory.AppData,
        paths: configured.configuration.storagePaths,
        delete: expect.any(Function),
      },
    ]);
    await subsystem.close();
  });

  it("configures, exposes, and clears an API-key provider through the subsystem", async () => {
    const adapter = apiKeyProvider();
    const configure = vi.spyOn(adapter.configuration, "configure");
    const clear = vi.spyOn(adapter.configuration, "clear");
    const subsystem = createProviderSubsystem([adapter]);

    await expect(subsystem.models.listModels(adapter.descriptor.id)).rejects.toThrow(
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

    await subsystem.storageAreas[0]?.delete();
    expect(clear).toHaveBeenCalledOnce();
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await subsystem.close();
  });

  it("orders configuration changes at the subsystem boundary", async () => {
    let configuration: ApiKeyProviderConfiguration = { state: "unconfigured" };
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
          configuration = { state: "configured" };
          events.push("configure:end");
          return configuration;
        },
        async clear() {
          events.push("clear");
          configuration = { state: "unconfigured" };
        },
        storagePaths: [],
      },
    });
    const subsystem = createProviderSubsystem([adapter]);
    const configuring = subsystem.providers.configureApiKey(adapter.descriptor.id, "secret");
    const clearing = subsystem.providers.clearConfiguration(adapter.descriptor.id);

    await vi.waitFor(() => expect(events).toEqual(["configure:start"]));
    finishConfiguration.resolve();

    await expect(configuring).resolves.toEqual({ state: "configured" });
    await expect(clearing).resolves.toBeUndefined();
    expect(events).toEqual(["configure:start", "configure:end", "clear"]);
    expect(subsystem.providers.inspectConfiguration(adapter.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await subsystem.close();
  });

  it("interrupts active provider work before clearing its configuration", async () => {
    let configuration: ApiKeyProviderConfiguration = { state: "configured" };
    let activeSignal: AbortSignal | undefined;
    const modelListingStarted = Promise.withResolvers<void>();
    const clearStarted = Promise.withResolvers<void>();
    const finishClear = Promise.withResolvers<void>();
    const adapter = apiKeyProvider({
      configuration: {
        kind: "api-key",
        inspect: () => configuration,
        async configure() {
          return { state: "configured" };
        },
        async clear() {
          clearStarted.resolve();
          await finishClear.promise;
          configuration = { state: "unconfigured" };
        },
        storagePaths: [],
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
    const subsystem = createProviderSubsystem([adapter, unrelated]);
    const listing = subsystem.models.listModels(adapter.descriptor.id);
    await modelListingStarted.promise;

    const clearing = subsystem.providers.clearConfiguration(adapter.descriptor.id);

    await expect(listing).rejects.toThrow('Provider "api-key-provider" is disconnecting.');
    await clearStarted.promise;
    expect(activeSignal?.aborted).toBe(true);
    await expect(subsystem.models.listModels(adapter.descriptor.id)).rejects.toThrow(
      'Provider "api-key-provider" is disconnecting.',
    );
    await expect(subsystem.models.listModels(unrelated.descriptor.id)).resolves.toEqual([
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
        inspect: () => ({ state: "configured" }),
        async configure() {
          return { state: "configured" };
        },
        async clear() {
          throw failure;
        },
        storagePaths: [],
      },
    });
    const subsystem = createProviderSubsystem([adapter]);

    await expect(subsystem.providers.clearConfiguration(adapter.descriptor.id)).rejects.toBe(
      failure,
    );
    await expect(
      subsystem.providers.configureApiKey(adapter.descriptor.id, "replacement"),
    ).resolves.toEqual({ state: "configured" });
    await expect(subsystem.models.listModels(adapter.descriptor.id)).resolves.toEqual([
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
    const subsystem = createProviderSubsystem([adapter]);

    await subsystem.models.listModels(adapter.descriptor.id);
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
    const subsystem = createProviderSubsystem([adapter]);
    const listing = subsystem.models.listModels(adapter.descriptor.id);
    await started.promise;

    const firstClose = subsystem.close();

    await expect(listing).rejects.toThrow("Providers are closing.");
    await firstClose;
    expect(subsystem.close()).toBe(firstClose);
    expect(activeSignal?.aborted).toBe(true);
    await expect(subsystem.models.listModels(adapter.descriptor.id)).rejects.toThrow(
      "Providers are closed.",
    );
  });

  it("rejects duplicate identities without requiring provider-specific methods", () => {
    const provider = configurationFreeProvider();

    expect(() => createProviderSubsystem([provider, provider])).toThrow(
      'Provider "local-provider" is registered more than once.',
    );
    expect(Object.keys(provider)).toEqual(["descriptor", "configuration", "models", "generation"]);
    expect(provider.configuration).toEqual({ kind: "none" });
  });
});
