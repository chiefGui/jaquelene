import { Context, Effect, Layer } from "effect";
import { providerConfigureResultSchema, providerKeyLabelSchema } from "@jaquelene/domain";
import type { ResourceCache } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
import { StorageCategory, type StorageArea } from "#backend/storage/storage";
import type {
  ApiKeyProviderConfigurationSnapshot,
  ProviderAdapter,
  ProviderConfiguration,
  ProviderConfigureResult,
  ProviderDescriptor,
  ProviderGenerationRequest,
  ProviderGenerationResult,
  ProviderFactory,
  ProviderId,
} from "./provider";
import { createModelCatalog, type Models, type ModelProvider } from "./model-catalog";

export type { Models, ModelProvider } from "./model-catalog";

export type ProviderSummary = ProviderDescriptor &
  Readonly<{
    configuration: ProviderConfiguration;
  }>;

export type Providers = Readonly<{
  list: () => readonly ProviderSummary[];
  inspectConfiguration: (providerId: ProviderId) => ProviderConfiguration;
  configureApiKey: (
    providerId: ProviderId,
    apiKey: string,
    signal?: AbortSignal,
  ) => Promise<ProviderConfigureResult>;
  clearConfiguration: (providerId: ProviderId) => Promise<void>;
}>;

export type ProviderGenerationRoute = Readonly<{
  generate: (
    request: ProviderGenerationRequest,
    signal?: AbortSignal,
  ) => Promise<ProviderGenerationResult>;
}>;

export type ProviderGenerationRouter = Readonly<{
  get: (providerId: ProviderId) => ProviderGenerationRoute | undefined;
}>;

type ActiveOperation = Readonly<{
  controller: AbortController;
  result: Promise<unknown>;
}>;

type RegisteredProvider = {
  adapter: ProviderAdapter;
  activeUses: Set<ActiveOperation>;
  pendingClears: number;
  configurationTail: Promise<void>;
};

type InspectedProviderConfiguration =
  | Readonly<{ kind: "none"; state: "configured" }>
  | (ApiKeyProviderConfigurationSnapshot & Readonly<{ kind: "api-key" }>);

type ProviderSubsystem = Readonly<{
  providers: Providers;
  models: Models;
  generations: ProviderGenerationRouter;
  storageAreas: readonly StorageArea[];
  close: () => Promise<void>;
}>;

async function disposeProvider(adapter: ProviderAdapter) {
  const disposeAsync = adapter[Symbol.asyncDispose];

  if (disposeAsync) {
    await disposeAsync.call(adapter);
    return;
  }

  adapter[Symbol.dispose]?.call(adapter);
}

async function disposeProviders(adapters: readonly ProviderAdapter[]) {
  const failures: unknown[] = [];

  for (const adapter of adapters.toReversed()) {
    try {
      await disposeProvider(adapter);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) {
    throw failures[0];
  }

  if (failures.length > 1) {
    throw new AggregateError(failures, "Multiple provider adapters failed to close.");
  }
}

async function createOwnedProviderSubsystem(
  factories: readonly ProviderFactory[],
  resourceCache: ResourceCache,
  signal: AbortSignal,
) {
  const adapters: ProviderAdapter[] = [];

  try {
    for (const factory of factories) {
      signal.throwIfAborted();
      const adapter = await factory.create(signal);
      adapters.push(adapter);

      if (adapter.descriptor.id !== factory.id) {
        throw new TypeError(
          `Provider factory "${factory.id}" created provider "${adapter.descriptor.id}".`,
        );
      }

      signal.throwIfAborted();
    }

    return createProviderSubsystem(adapters, resourceCache);
  } catch (error) {
    try {
      await disposeProviders(adapters);
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Could not close provider adapters after acquisition failed.",
      );
    }

    throw error;
  }
}

function requireText(value: string, description: string) {
  if (!value.trim()) {
    throw new TypeError(`Provider ${description} must contain text.`);
  }
}

function requireAdapter(adapter: ProviderAdapter) {
  requireText(adapter.descriptor.id, "identity");
  requireText(adapter.descriptor.name, `"${adapter.descriptor.id}" name`);
  requireText(adapter.descriptor.brandId, `"${adapter.descriptor.id}" brand identity`);

  if (adapter.configuration.kind === "api-key") {
    if (
      typeof adapter.configuration.inspect !== "function" ||
      typeof adapter.configuration.configure !== "function" ||
      typeof adapter.configuration.clear !== "function"
    ) {
      throw new TypeError(
        `API-key provider "${adapter.descriptor.id}" has an invalid configuration adapter.`,
      );
    }
  } else if (adapter.configuration.kind !== "none") {
    throw new TypeError(`Provider "${adapter.descriptor.id}" has an unknown configuration kind.`);
  }

  if (
    typeof adapter.models.list !== "function" ||
    typeof adapter.generation.generate !== "function"
  ) {
    throw new TypeError(`Provider "${adapter.descriptor.id}" has incomplete capabilities.`);
  }
}

function requireApiKeyConfiguration(
  providerId: ProviderId,
  configuration: ApiKeyProviderConfigurationSnapshot,
) {
  if (configuration.state === "unconfigured") {
    return configuration;
  }

  if (configuration.state !== "configured") {
    throw new TypeError(`Provider "${providerId}" returned an invalid configuration state.`);
  }

  if (!providerKeyLabelSchema.safeParse(configuration.keyLabel).success) {
    throw new TypeError(`Provider "${providerId}" returned an invalid API-key label.`);
  }

  if (!configuration.revision.trim()) {
    throw new TypeError(`Provider "${providerId}" returned an invalid configuration revision.`);
  }

  return configuration;
}

function requireConfigureResult(
  providerId: ProviderId,
  candidate: unknown,
): ProviderConfigureResult {
  const result = providerConfigureResultSchema.safeParse(candidate);

  if (result.success) {
    return result.data;
  }

  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "state" in candidate &&
    candidate.state === "configured" &&
    (!("keyLabel" in candidate) || !providerKeyLabelSchema.safeParse(candidate.keyLabel).success)
  ) {
    throw new TypeError(`Provider "${providerId}" returned an invalid API-key label.`);
  }

  throw new TypeError(`Provider "${providerId}" returned an invalid configuration result.`);
}

function interruption(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Provider operation was interrupted.", { cause: signal.reason });
}

function waitForOperation<Result>(operation: Promise<Result>, signal: AbortSignal) {
  if (signal.aborted) {
    operation.catch(() => undefined);
    return Promise.reject(interruption(signal));
  }

  let stopWaiting: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(interruption(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    stopWaiting = () => signal.removeEventListener("abort", onAbort);

    if (signal.aborted) {
      onAbort();
    }
  });

  return Promise.race([operation, interrupted]).finally(stopWaiting);
}

export function createProviderSubsystem(
  adapters: readonly ProviderAdapter[],
  resourceCache: ResourceCache,
): ProviderSubsystem {
  const providersById = new Map<ProviderId, RegisteredProvider>();

  for (const adapter of adapters) {
    requireAdapter(adapter);
    const { id } = adapter.descriptor;

    if (providersById.has(id)) {
      throw new Error(`Provider "${id}" is registered more than once.`);
    }

    providersById.set(id, {
      adapter,
      activeUses: new Set(),
      pendingClears: 0,
      configurationTail: Promise.resolve(),
    });
  }

  let state: "open" | "closing" | "closed" = "open";
  let closePromise: Promise<void> | undefined;
  const activeOperations = new Set<ActiveOperation>();

  function requireProvider(providerId: ProviderId) {
    const provider = providersById.get(providerId);

    if (!provider) {
      throw new RangeError(`Unknown provider "${providerId}".`);
    }

    return provider;
  }

  function inspectAdapterConfiguration(adapter: ProviderAdapter): InspectedProviderConfiguration {
    if (adapter.configuration.kind === "none") {
      return { kind: "none", state: "configured" };
    }

    return {
      kind: "api-key",
      ...requireApiKeyConfiguration(adapter.descriptor.id, adapter.configuration.inspect()),
    };
  }

  function inspectConfiguration(adapter: ProviderAdapter): ProviderConfiguration {
    const configuration = inspectAdapterConfiguration(adapter);

    if (configuration.kind === "none") {
      return configuration;
    }

    if (configuration.state === "unconfigured") {
      return { kind: "api-key", state: "unconfigured" };
    }

    return {
      kind: "api-key",
      state: "configured",
      keyLabel: configuration.keyLabel,
    };
  }

  function trackOperation<Result>(
    controller: AbortController,
    signal: AbortSignal,
    operation: Promise<Result>,
    providerOperations?: Set<ActiveOperation>,
  ) {
    const result = waitForOperation(operation, signal);
    const active = { controller, result } satisfies ActiveOperation;
    activeOperations.add(active);
    providerOperations?.add(active);
    void result
      .finally(() => {
        activeOperations.delete(active);
        providerOperations?.delete(active);
      })
      .catch(() => undefined);
    return result;
  }

  function runOperation<Result>(
    signal: AbortSignal | undefined,
    operation: (operationSignal: AbortSignal) => Promise<Result>,
    providerOperations?: Set<ActiveOperation>,
  ) {
    if (state !== "open") {
      return Promise.reject(new Error("Providers are closed."));
    }

    const controller = new AbortController();
    const operationSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    return trackOperation(
      controller,
      operationSignal,
      Promise.resolve().then(() => operation(operationSignal)),
      providerOperations,
    );
  }

  function runProviderUse<Result>(
    provider: RegisteredProvider,
    signal: AbortSignal | undefined,
    operation: (operationSignal: AbortSignal) => Promise<Result>,
  ) {
    return runOperation(
      signal,
      async (operationSignal) => {
        operationSignal.throwIfAborted();

        if (provider.pendingClears > 0) {
          throw new Error(`Provider "${provider.adapter.descriptor.id}" is disconnecting.`);
        }

        if (inspectConfiguration(provider.adapter).state !== "configured") {
          throw new Error(`Provider "${provider.adapter.descriptor.id}" is not configured.`);
        }

        return operation(operationSignal);
      },
      provider.activeUses,
    );
  }

  function changeConfiguration<Result>(
    provider: RegisteredProvider,
    signal: AbortSignal | undefined,
    operation: (operationSignal: AbortSignal) => Promise<Result>,
    afterCompletion?: () => void,
  ) {
    if (state !== "open") {
      return Promise.reject(new Error("Providers are closed."));
    }

    const controller = new AbortController();
    const operationSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const operationResult = provider.configurationTail.then(() => {
      operationSignal.throwIfAborted();
      return operation(operationSignal);
    });
    const finalizedResult = afterCompletion
      ? operationResult.finally(afterCompletion)
      : operationResult;
    provider.configurationTail = finalizedResult.then(
      () => undefined,
      () => undefined,
    );
    return trackOperation(controller, operationSignal, finalizedResult);
  }

  function configurationRevision(provider: RegisteredProvider) {
    const configuration = inspectAdapterConfiguration(provider.adapter);

    if (configuration.state !== "configured") {
      throw new Error(`Provider "${provider.adapter.descriptor.id}" is not configured.`);
    }

    return configuration.kind === "none" ? "configuration-free-v1" : configuration.revision;
  }

  const modelCatalog = createModelCatalog(resourceCache, {
    listProviders: () =>
      [...providersById.values()].flatMap<ModelProvider>((provider) =>
        inspectAdapterConfiguration(provider.adapter).state === "configured"
          ? [
              {
                id: provider.adapter.descriptor.id,
                brandId: provider.adapter.descriptor.brandId,
              },
            ]
          : [],
      ),
    getSource(providerId) {
      if (state !== "open") {
        throw new Error("Providers are closed.");
      }

      const provider = requireProvider(providerId);

      if (provider.pendingClears > 0) {
        throw new Error(`Provider "${providerId}" is disconnecting.`);
      }

      const expectedRevision = configurationRevision(provider);

      return {
        providerId,
        configurationRevision: expectedRevision,
        async list(signal) {
          if (configurationRevision(provider) !== expectedRevision) {
            throw new Error(`Provider "${providerId}" configuration changed before model loading.`);
          }

          const models = await runProviderUse(provider, signal, (operationSignal) =>
            provider.adapter.models.list(operationSignal),
          );

          if (configurationRevision(provider) !== expectedRevision) {
            throw new Error(`Provider "${providerId}" configuration changed during model loading.`);
          }

          return models;
        },
      };
    },
  });

  const providers: Providers = {
    list: () =>
      [...providersById.values()].map(({ adapter }) => ({
        ...adapter.descriptor,
        configuration: inspectConfiguration(adapter),
      })),

    inspectConfiguration: (providerId) => inspectConfiguration(requireProvider(providerId).adapter),

    configureApiKey(providerId, apiKey, signal) {
      const provider = requireProvider(providerId);
      const { adapter } = provider;
      const { configuration } = adapter;

      if (configuration.kind !== "api-key") {
        return Promise.reject(new TypeError(`Provider "${providerId}" does not use an API key.`));
      }

      return changeConfiguration(provider, signal, async (operationSignal) => {
        const result = requireConfigureResult(
          providerId,
          await configuration.configure(apiKey, operationSignal),
        );

        if (result.state === "configured") {
          configurationRevision(provider);
          await modelCatalog.invalidateProvider(providerId);
        }

        return result;
      });
    },

    clearConfiguration(providerId) {
      const provider = requireProvider(providerId);
      const { adapter } = provider;
      const { configuration } = adapter;

      if (configuration.kind !== "api-key") {
        return Promise.reject(
          new TypeError(`Provider "${providerId}" has no configuration to clear.`),
        );
      }

      if (state !== "open") {
        return Promise.reject(new Error("Providers are closed."));
      }

      provider.pendingClears += 1;
      const reason = new Error(`Provider "${providerId}" is disconnecting.`);
      const activeUses = [...provider.activeUses];

      for (const { controller } of activeUses) {
        controller.abort(reason);
      }

      return changeConfiguration(
        provider,
        undefined,
        async (signal) => {
          await Promise.allSettled(activeUses.map(({ result }) => result));
          signal.throwIfAborted();
          await configuration.clear();

          if (inspectAdapterConfiguration(adapter).state !== "unconfigured") {
            throw new Error(`Provider "${providerId}" remained configured after clearing it.`);
          }

          await modelCatalog.invalidateProvider(providerId);
        },
        () => {
          provider.pendingClears -= 1;
        },
      );
    },
  };

  const models = modelCatalog.models;

  const generationRoutes = new Map<ProviderId, ProviderGenerationRoute>(
    [...providersById.values()].map((provider) => [
      provider.adapter.descriptor.id,
      {
        generate(request, signal) {
          return runProviderUse(provider, signal, (operationSignal) =>
            provider.adapter.generation.generate(request, operationSignal),
          );
        },
      },
    ]),
  );
  const generations: ProviderGenerationRouter = {
    get: (providerId) => generationRoutes.get(providerId),
  };

  const storageAreas = [...providersById.values()].flatMap<StorageArea>(({ adapter }) => {
    if (adapter.configuration.kind !== "api-key") {
      return [];
    }

    return [
      {
        id: `provider:${adapter.descriptor.id}`,
        category: StorageCategory.AppData,
        paths: [...adapter.configuration.storagePaths],
        delete: () => providers.clearConfiguration(adapter.descriptor.id),
      },
    ];
  });

  return {
    providers,
    models,
    generations,
    storageAreas,
    close() {
      if (!closePromise) {
        state = "closing";
        modelCatalog.close();
        const reason = new Error("Providers are closing.");

        for (const { controller } of activeOperations) {
          controller.abort(reason);
        }

        closePromise = Promise.allSettled([...activeOperations].map(({ result }) => result))
          .then(() => disposeProviders(adapters))
          .finally(() => {
            state = "closed";
          });
      }

      return closePromise;
    },
  };
}

export class ProvidersService extends Context.Service<ProvidersService, ProviderSubsystem>()(
  "@jaquelene/backend/Providers",
) {
  static readonly layer = (factories: readonly ProviderFactory[]) =>
    Layer.effect(
      ProvidersService,
      Effect.gen(function* () {
        const resourceCache = yield* ResourceCacheService;

        return yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: (signal) => createOwnedProviderSubsystem(factories, resourceCache, signal),
            catch: (error) =>
              error instanceof Error
                ? error
                : new Error("Could not create provider adapters.", { cause: error }),
          }),
          (providers) => Effect.promise(() => providers.close()),
          { interruptible: true },
        );
      }),
    );
}
