import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  FiberSet,
  Layer,
  Predicate,
  Queue,
  Schema,
  Scope,
} from "effect";
import { providerConfigureResultSchema, providerKeyLabelSchema } from "@jaquelene/domain";
import type { ResourceCache } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
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

export class ProviderAcquisitionError extends Schema.TaggedError<ProviderAcquisitionError>()(
  "ProviderAcquisitionError",
  { providerId: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `Could not acquire provider "${this.providerId}".`;
  }
}

export class ProviderOperationError extends Schema.TaggedError<ProviderOperationError>()(
  "ProviderOperationError",
  {
    providerId: Schema.String,
    operation: Schema.Literals(["configure", "clear", "models", "generate"]),
    cause: Schema.Defect(),
  },
) {
  override get message() {
    if (Predicate.isError(this.cause)) {
      return this.cause.message;
    }
    return `Provider "${this.providerId}" could not complete ${this.operation}.`;
  }
}

export type ProviderSummary = ProviderDescriptor &
  Readonly<{ configuration: ProviderConfiguration }>;

export type Providers = Readonly<{
  list: () => readonly ProviderSummary[];
  inspectConfiguration: (providerId: ProviderId) => ProviderConfiguration;
  configureApiKey: (
    providerId: ProviderId,
    apiKey: string,
  ) => Effect.Effect<ProviderConfigureResult, ProviderOperationError>;
  clearConfiguration: (providerId: ProviderId) => Effect.Effect<void, ProviderOperationError>;
}>;

export type ProviderGenerationRoute = Readonly<{
  generate: (
    request: ProviderGenerationRequest,
  ) => Effect.Effect<ProviderGenerationResult, ProviderOperationError>;
}>;

export type ProviderGenerationRouter = Readonly<{
  get: (providerId: ProviderId) => ProviderGenerationRoute | undefined;
}>;

type OperationFiber = Fiber.Fiber<unknown, ProviderOperationError>;

type RegisteredProvider = {
  adapter: ProviderAdapter;
  uses: FiberSet.FiberSet<unknown, ProviderOperationError>;
  configurations: Queue.Queue<Fiber.Fiber<unknown, unknown>>;
  pendingClears: number;
};

type InspectedProviderConfiguration =
  | Readonly<{ kind: "none"; state: "configured" }>
  | (ApiKeyProviderConfigurationSnapshot & Readonly<{ kind: "api-key" }>);

const acquireProvider = Effect.fnUntraced(function* (factory: ProviderFactory) {
  const adapter = yield* factory.create.pipe(
    Effect.mapError((cause) => new ProviderAcquisitionError({ providerId: factory.id, cause })),
  );
  requireAdapter(adapter);
  if (adapter.descriptor.id !== factory.id) {
    throw new TypeError(
      `Provider factory "${factory.id}" created provider "${adapter.descriptor.id}".`,
    );
  }
  if ((factory.storagePaths !== null) !== (adapter.configuration.kind === "api-key")) {
    throw new TypeError(
      `Provider factory "${factory.id}" storage does not match its configuration capability.`,
    );
  }
  return adapter;
});

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
      !Effect.isEffect(adapter.configuration.clear)
    ) {
      throw new TypeError(
        `API-key provider "${adapter.descriptor.id}" has an invalid configuration adapter.`,
      );
    }
  } else if (adapter.configuration.kind !== "none") {
    throw new TypeError(`Provider "${adapter.descriptor.id}" has an unknown configuration kind.`);
  }

  if (!Effect.isEffect(adapter.models.list) || typeof adapter.generation.generate !== "function") {
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

const interruptOperations = Effect.fnUntraced(function* (fibers: Iterable<OperationFiber>) {
  const active = [...fibers];
  yield* Fiber.interruptAll(active);
  const exits = yield* Effect.forEach(active, Fiber.await);
  const reasons = exits.flatMap((exit) => {
    if (Exit.isSuccess(exit)) {
      return [];
    }
    return exit.cause.reasons.filter((reason) => !Cause.isInterruptReason(reason));
  });
  if (reasons.length > 0) {
    return yield* Effect.failCause(Cause.fromReasons(reasons));
  }
}, Effect.uninterruptible);

const runOwned = Effect.fnUntraced(function* <Result>(
  owner: FiberSet.FiberSet<unknown, ProviderOperationError>,
  operation: Effect.Effect<Result, ProviderOperationError>,
) {
  const exit = yield* Effect.acquireUseRelease(
    FiberSet.run(owner, operation),
    Fiber.await,
    (fiber, exit) => {
      if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) {
        return interruptOperations([fiber]);
      }
      return Effect.void;
    },
  );
  return yield* exit;
});

const createProviders = Effect.fnUntraced(function* (
  adapters: readonly ProviderAdapter[],
  resourceCache: ResourceCache,
) {
  const operationScope = yield* Scope.fork(yield* Effect.scope, "parallel");
  const configurations = yield* FiberSet.make<unknown, ProviderOperationError>().pipe(
    Effect.provideService(Scope.Scope, operationScope),
  );
  const providersById = new Map<ProviderId, RegisteredProvider>();
  for (const adapter of adapters) {
    const uses = yield* FiberSet.make<unknown, ProviderOperationError>().pipe(
      Effect.provideService(Scope.Scope, operationScope),
    );
    const queue = yield* Effect.acquireRelease(
      Queue.bounded<Fiber.Fiber<unknown, unknown>>(0),
      Queue.shutdown,
    ).pipe(Effect.provideService(Scope.Scope, operationScope));
    yield* Effect.forever(Effect.flatMap(Queue.take(queue), Fiber.await)).pipe(
      Effect.forkIn(operationScope),
    );
    providersById.set(adapter.descriptor.id, {
      adapter,
      uses,
      configurations: queue,
      pendingClears: 0,
    });
  }

  let open = true;

  function requireOpen() {
    if (!open) {
      throw new Error("Providers are closed.");
    }
  }

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
    if (configuration.kind === "none" || configuration.state === "unconfigured") {
      return configuration;
    }
    return { kind: "api-key", state: "configured", keyLabel: configuration.keyLabel };
  }

  function requireAdmission(provider: RegisteredProvider) {
    requireOpen();
    if (provider.pendingClears > 0) {
      throw new Error(`Provider "${provider.adapter.descriptor.id}" is disconnecting.`);
    }
  }

  function requireAvailable(provider: RegisteredProvider) {
    requireAdmission(provider);
    if (inspectConfiguration(provider.adapter).state !== "configured") {
      throw new Error(`Provider "${provider.adapter.descriptor.id}" is not configured.`);
    }
  }

  function operationError(providerId: ProviderId, operation: ProviderOperationError["operation"]) {
    return (cause: unknown) => new ProviderOperationError({ providerId, operation, cause });
  }

  const useProvider = Effect.fnUntraced(function* <Result>(
    provider: RegisteredProvider,
    operation: "models" | "generate",
    effect: Effect.Effect<Result, unknown>,
  ) {
    const fail = operationError(provider.adapter.descriptor.id, operation);
    yield* Effect.try({ try: requireOpen, catch: fail });
    return yield* runOwned(
      provider.uses,
      Effect.try({ try: () => requireAvailable(provider), catch: fail }).pipe(
        Effect.andThen(effect.pipe(Effect.mapError(fail))),
      ),
    );
  });

  function configurationRevision(provider: RegisteredProvider) {
    const configuration = inspectAdapterConfiguration(provider.adapter);
    if (configuration.state !== "configured") {
      throw new Error(`Provider "${provider.adapter.descriptor.id}" is not configured.`);
    }
    if (configuration.kind === "none") {
      return "configuration-free-v1";
    }
    return configuration.revision;
  }

  const modelCatalog = yield* createModelCatalog(resourceCache, {
    listProviders: () =>
      [...providersById.values()].flatMap<ModelProvider>((provider) => {
        if (inspectAdapterConfiguration(provider.adapter).state !== "configured") {
          return [];
        }
        return [
          { id: provider.adapter.descriptor.id, brandId: provider.adapter.descriptor.brandId },
        ];
      }),
    getSource(providerId) {
      const provider = requireProvider(providerId);
      requireAdmission(provider);
      const expectedRevision = configurationRevision(provider);
      return {
        providerId,
        configurationRevision: expectedRevision,
      };
    },
    load({ providerId, configurationRevision: expectedRevision }) {
      const provider = requireProvider(providerId);
      const readRevision = Effect.try({
        try: () => configurationRevision(provider),
        catch: (cause) => cause,
      });
      return useProvider(
        provider,
        "models",
        Effect.gen(function* () {
          if ((yield* readRevision) !== expectedRevision) {
            throw new Error(`Provider "${providerId}" configuration changed before model loading.`);
          }
          const models = yield* provider.adapter.models.list;
          if ((yield* readRevision) !== expectedRevision) {
            throw new Error(`Provider "${providerId}" configuration changed during model loading.`);
          }
          return models;
        }),
      );
    },
  });

  const changeConfiguration = Effect.fnUntraced(function* <Result>(
    provider: RegisteredProvider,
    effect: Effect.Effect<Result, unknown>,
  ) {
    const inspect = Effect.try({
      try: () => inspectAdapterConfiguration(provider.adapter),
      catch: (cause) => cause,
    });
    const before = yield* inspect;
    return yield* effect.pipe(
      Effect.onExit(() =>
        Effect.gen(function* () {
          const after = yield* inspect;
          if (before.state === after.state) {
            if (before.state === "unconfigured" || after.state === "unconfigured") {
              return;
            }
            if (
              before.kind === "none" ||
              after.kind === "none" ||
              before.revision === after.revision
            ) {
              return;
            }
          }
          yield* Effect.tryPromise({
            try: () => modelCatalog.invalidateProvider(provider.adapter.descriptor.id),
            catch: (cause) => cause,
          });
        }),
      ),
    );
  });

  const admitConfiguration = (provider: RegisteredProvider) =>
    Effect.withFiber((fiber) => Queue.offer(provider.configurations, fiber)).pipe(
      Effect.flatMap((accepted) => {
        if (!accepted) {
          return Effect.interrupt;
        }
        return Effect.void;
      }),
    );

  const configureApiKey = Effect.fn("Providers.configureApiKey")(function* (
    providerId: ProviderId,
    apiKey: string,
  ) {
    const fail = operationError(providerId, "configure");
    const provider = yield* Effect.try({
      try: () => {
        requireOpen();
        return requireProvider(providerId);
      },
      catch: fail,
    });
    const configuration = provider.adapter.configuration;
    if (configuration.kind !== "api-key") {
      return yield* Effect.fail(
        fail(new TypeError(`Provider "${providerId}" does not use an API key.`)),
      );
    }
    return yield* runOwned(
      configurations,
      Effect.gen(function* () {
        requireOpen();
        yield* admitConfiguration(provider);
        requireOpen();
        return yield* changeConfiguration(
          provider,
          configuration.configure(apiKey).pipe(
            Effect.flatMap((result): Effect.Effect<ProviderConfigureResult, unknown> => {
              const configured = requireConfigureResult(providerId, result);
              if (configured.state === "configured") {
                return Effect.try({
                  try: () => configurationRevision(provider),
                  catch: (cause) => cause,
                }).pipe(Effect.as(configured));
              }
              return Effect.succeed(configured);
            }),
          ),
        );
      }).pipe(Effect.mapError(fail)),
    );
  });

  const clearConfiguration = Effect.fn("Providers.clearConfiguration")(function* (
    providerId: ProviderId,
  ) {
    const fail = operationError(providerId, "clear");
    const provider = yield* Effect.try({
      try: () => {
        requireOpen();
        return requireProvider(providerId);
      },
      catch: fail,
    });
    const configuration = provider.adapter.configuration;
    if (configuration.kind !== "api-key") {
      return yield* Effect.fail(
        fail(new TypeError(`Provider "${providerId}" has no configuration to clear.`)),
      );
    }
    return yield* runOwned(
      configurations,
      Effect.acquireUseRelease(
        Effect.sync(() => {
          requireOpen();
          provider.pendingClears += 1;
        }),
        () =>
          Effect.acquireUseRelease(
            interruptOperations([...provider.uses]).pipe(
              Effect.forkChild({ startImmediately: true }),
            ),
            (draining) =>
              Effect.gen(function* () {
                yield* admitConfiguration(provider);
                requireOpen();
                yield* Fiber.join(draining);
                yield* changeConfiguration(
                  provider,
                  configuration.clear.pipe(
                    Effect.tap(() =>
                      Effect.try({
                        try: () => inspectAdapterConfiguration(provider.adapter),
                        catch: (cause) => cause,
                      }).pipe(
                        Effect.map((configuration) => {
                          if (configuration.state !== "unconfigured") {
                            throw new Error(
                              `Provider "${providerId}" remained configured after clearing it.`,
                            );
                          }
                        }),
                      ),
                    ),
                  ),
                );
              }),
            (draining, exit) => {
              if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) {
                return Fiber.join(draining);
              }
              return Effect.void;
            },
          ),
        () =>
          Effect.sync(() => {
            provider.pendingClears -= 1;
          }),
      ).pipe(Effect.mapError(fail)),
    );
  });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      open = false;
      modelCatalog.close();
      yield* interruptOperations([
        ...configurations,
        ...[...providersById.values()].flatMap((provider) => [...provider.uses]),
      ]).pipe(Effect.orDie);
    }),
  );

  const providers: Providers = {
    list: () =>
      [...providersById.values()].map(({ adapter }) => ({
        ...adapter.descriptor,
        configuration: inspectConfiguration(adapter),
      })),
    inspectConfiguration: (providerId) => inspectConfiguration(requireProvider(providerId).adapter),
    configureApiKey,
    clearConfiguration,
  };
  const generationRoutes = new Map<ProviderId, ProviderGenerationRoute>(
    [...providersById.values()].map((provider) => [
      provider.adapter.descriptor.id,
      {
        generate: (request) =>
          useProvider(
            provider,
            "generate",
            Effect.suspend(() => provider.adapter.generation.generate(request)),
          ),
      },
    ]),
  );
  return {
    providers,
    models: modelCatalog.models,
    generations: { get: (providerId: ProviderId) => generationRoutes.get(providerId) },
  };
});

export class ProvidersService extends Context.Service<
  ProvidersService,
  {
    readonly providers: Providers;
    readonly models: Models;
    readonly generations: ProviderGenerationRouter;
  }
>()("@jaquelene/backend/Providers") {
  static readonly layer = (factories: readonly ProviderFactory[]) =>
    Layer.effect(
      ProvidersService,
      Effect.gen(function* () {
        const resourceCache = yield* ResourceCacheService;
        const identities = new Set<ProviderId>();
        for (const factory of factories) {
          if (identities.has(factory.id)) {
            throw new Error(`Provider "${factory.id}" is registered more than once.`);
          }
          identities.add(factory.id);
        }
        const adapters: ProviderAdapter[] = [];
        for (const factory of factories) {
          adapters.push(yield* acquireProvider(factory));
        }
        return ProvidersService.of(yield* createProviders(adapters, resourceCache));
      }),
    );
}
