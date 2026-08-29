import { Context, Effect, Layer } from "effect";
import { StorageCategory, type StorageArea } from "#backend/storage/storage";
import type {
  ApiKeyProviderConfiguration,
  ProviderAdapter,
  ProviderConfiguration,
  ProviderConfigureResult,
  ProviderDescriptor,
  ProviderGenerationRequest,
  ProviderGenerationResult,
  ProviderId,
  ProviderModel,
} from "./provider";

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

export type ModelProvider = Readonly<Pick<ProviderDescriptor, "id" | "brandId">>;

export type Models = Readonly<{
  listProviders: () => readonly ModelProvider[];
  listModels: (providerId: ProviderId, signal?: AbortSignal) => Promise<readonly ProviderModel[]>;
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

type ProviderSubsystem = Readonly<{
  providers: Providers;
  models: Models;
  generations: ProviderGenerationRouter;
  storageAreas: readonly StorageArea[];
  close: () => Promise<void>;
}>;

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
  configuration: ApiKeyProviderConfiguration,
) {
  if (configuration.state === "unconfigured") {
    return configuration;
  }

  if (configuration.state !== "configured") {
    throw new TypeError(`Provider "${providerId}" returned an invalid configuration state.`);
  }

  if (configuration.keyLabel !== undefined && !configuration.keyLabel.trim()) {
    throw new TypeError(`Provider "${providerId}" returned an invalid API-key label.`);
  }

  return configuration;
}

function requireConfigureResult(providerId: ProviderId, result: ProviderConfigureResult) {
  if (result.state === "rejected" || result.state === "unavailable") {
    return result;
  }

  if (result.state !== "configured") {
    throw new TypeError(`Provider "${providerId}" returned an invalid configuration result.`);
  }

  if (result.keyLabel !== undefined && !result.keyLabel.trim()) {
    throw new TypeError(`Provider "${providerId}" returned an invalid API-key label.`);
  }

  return result;
}

function requireModel(providerId: ProviderId, model: ProviderModel) {
  requireText(model.id, `"${providerId}" model identity`);
  requireText(model.name, `"${providerId}" model "${model.id}" name`);
  requireText(model.brandId, `"${providerId}" model "${model.id}" brand identity`);

  if (model.tokenPricing) {
    const { inputUsdPerMillion, outputUsdPerMillion } = model.tokenPricing;

    if (
      !Number.isFinite(inputUsdPerMillion) ||
      inputUsdPerMillion < 0 ||
      !Number.isFinite(outputUsdPerMillion) ||
      outputUsdPerMillion < 0
    ) {
      throw new TypeError(`Provider "${providerId}" model "${model.id}" has invalid pricing.`);
    }
  }

  return {
    id: model.id,
    name: model.name,
    brandId: model.brandId,
    ...(model.tokenPricing
      ? {
          tokenPricing: {
            inputUsdPerMillion: model.tokenPricing.inputUsdPerMillion,
            outputUsdPerMillion: model.tokenPricing.outputUsdPerMillion,
          },
        }
      : {}),
  } satisfies ProviderModel;
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

export function createProviderSubsystem(adapters: readonly ProviderAdapter[]): ProviderSubsystem {
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

  function inspectConfiguration(adapter: ProviderAdapter): ProviderConfiguration {
    if (adapter.configuration.kind === "none") {
      return { kind: "none", state: "configured" };
    }

    return {
      kind: "api-key",
      ...requireApiKeyConfiguration(adapter.descriptor.id, adapter.configuration.inspect()),
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

      return changeConfiguration(provider, signal, async (operationSignal) =>
        requireConfigureResult(providerId, await configuration.configure(apiKey, operationSignal)),
      );
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
        },
        () => {
          provider.pendingClears -= 1;
        },
      );
    },
  };

  const models: Models = {
    listProviders: () =>
      [...providersById.values()].flatMap(({ adapter }) =>
        inspectConfiguration(adapter).state === "configured"
          ? [{ id: adapter.descriptor.id, brandId: adapter.descriptor.brandId }]
          : [],
      ),

    listModels(providerId, signal) {
      const provider = requireProvider(providerId);
      const { adapter } = provider;

      return runProviderUse(provider, signal, async (operationSignal) => {
        const models = await adapter.models.list(operationSignal);
        const modelsById = new Map<string, ProviderModel>();

        for (const model of models) {
          const registered = requireModel(providerId, model);

          if (modelsById.has(registered.id)) {
            throw new Error(
              `Provider "${providerId}" returned model "${registered.id}" more than once.`,
            );
          }

          modelsById.set(registered.id, registered);
        }

        return [...modelsById.values()];
      });
    },
  };

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
        const reason = new Error("Providers are closing.");

        for (const { controller } of activeOperations) {
          controller.abort(reason);
        }

        closePromise = Promise.allSettled([...activeOperations].map(({ result }) => result)).then(
          () => {
            state = "closed";
          },
        );
      }

      return closePromise;
    },
  };
}

export class ProvidersService extends Context.Service<ProvidersService, ProviderSubsystem>()(
  "@jaquelene/backend/Providers",
) {
  static readonly layer = (adapters: readonly ProviderAdapter[]) =>
    Layer.effect(
      ProvidersService,
      Effect.acquireRelease(
        Effect.sync(() => ProvidersService.of(createProviderSubsystem(adapters))),
        (providers) => Effect.promise(() => providers.close()),
      ),
    );
}
