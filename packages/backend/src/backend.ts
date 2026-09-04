import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import type { Campaigns } from "#backend/campaign/campaigns";
import { CampaignService } from "#backend/campaign/subsystem";
import type { CampaignUsageReader } from "#backend/campaign/usage";
import { DatabaseService, getDatabaseStoragePaths } from "#backend/database/database";
import { GenerationService } from "#backend/generation/subsystem";
import { ModelInputService } from "#backend/model/input-composer";
import type { ProviderFactory } from "#backend/provider/provider";
import { ProvidersService, type Models, type Providers } from "#backend/provider/providers";
import type { ResourceCacheFailure } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
import { getCacheStoragePaths } from "#backend/resource-cache/sqlite-cache-store";
import { narratorPromptModule } from "#backend/narrator/module";
import { createCacheStorageArea } from "#backend/storage/cache";
import { createContentStorageArea } from "#backend/storage/content";
import {
  StorageService,
  assertStoragePathsAreDisjoint,
  type Storage,
  type StorageArea,
  type StorageAreaId,
  type StorageCategory,
} from "#backend/storage/storage";
import { PromptService } from "#backend/prompt/subsystem";
import type { Prompts } from "#backend/prompt/types";
import { ThreadService, type Threads } from "#backend/thread/subsystem";
import { TurnService } from "#backend/turn/subsystem";
import type { Turns } from "#backend/turn/turns";
import type { Usage } from "#backend/usage/history";
import { UsageService } from "#backend/usage/subsystem";

export type BackendOptions = Readonly<{
  databasePath: string;
  cache: Readonly<{
    path: string;
    reportFailure: (failure: ResourceCacheFailure) => void;
  }>;
  providers: readonly ProviderFactory[];
  storageAreas: readonly StorageArea[];
}>;

export type BackendInspection = Readonly<{
  state: "open" | "closing" | "closed";
  terminalFailure?: unknown;
}>;

export type Backend = Readonly<{
  campaigns: Campaigns;
  campaignUsage: CampaignUsageReader;
  usage: Usage;
  prompts: Prompts;
  threads: Threads;
  turns: Turns;
  providers: Providers;
  models: Models;
  storage: Storage;
  inspect: () => BackendInspection;
  close: () => Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}>;

type BackendCapabilities = Readonly<{
  campaigns: Campaigns;
  campaignUsage: CampaignUsageReader;
  usage: Usage;
  prompts: Prompts;
  threads: Threads;
  turns: Turns;
  providers: Providers;
  models: Models;
}>;

const readBackendCapabilities = Effect.gen(function* () {
  const campaigns = yield* CampaignService;
  const prompts = yield* PromptService;
  const providers = yield* ProvidersService;
  const threads = yield* ThreadService;
  const turns = yield* TurnService;
  const usage = yield* UsageService;

  return {
    campaigns: campaigns.campaigns,
    campaignUsage: campaigns.usage,
    prompts: prompts.prompts,
    providers: providers.providers,
    models: providers.models,
    threads: threads.threads,
    turns,
    usage,
  } satisfies BackendCapabilities;
});

function createStorageLayer(
  databasePath: string,
  cachePath: string,
  storageAreas: readonly StorageArea[],
) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const providers = yield* ProvidersService;
      const resourceCache = yield* ResourceCacheService;

      return StorageService.layer([
        createContentStorageArea(database, databasePath),
        createCacheStorageArea(resourceCache, cachePath),
        ...providers.storageAreas,
        ...storageAreas,
      ]);
    }),
  );
}

function asError(cause: unknown, message: string) {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

function causeError<E>(cause: Cause.Cause<E>, message: string) {
  const errors = Cause.prettyErrors(cause);

  if (errors.length === 1) {
    return errors[0]!;
  }

  return new AggregateError(errors, message);
}

async function unwrapExit<A, E>(exitPromise: Promise<Exit.Exit<A, E>>) {
  const exit = await exitPromise;

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw causeError(exit.cause, "Backend operation failed.");
}

function createBackendLayer({
  databasePath,
  cache: cacheOptions,
  providers,
  storageAreas,
}: BackendOptions) {
  const databaseLayer = DatabaseService.layer(databasePath);
  const resourceCacheLayer = ResourceCacheService.layer(cacheOptions);
  const campaignsLayer = CampaignService.layer().pipe(Layer.provide(databaseLayer));
  const promptsLayer = PromptService.layer([narratorPromptModule]).pipe(
    Layer.provide(databaseLayer),
  );
  const usageLayer = UsageService.layer.pipe(Layer.provide(databaseLayer));
  const providersLayer = ProvidersService.layer(providers).pipe(Layer.provide(resourceCacheLayer));
  const modelInputsLayer = ModelInputService.layer.pipe(
    Layer.provide(Layer.merge(campaignsLayer, promptsLayer)),
  );
  const threadsLayer = ThreadService.layer().pipe(
    Layer.provide(Layer.merge(databaseLayer, modelInputsLayer)),
  );
  const generationsLayer = GenerationService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(databaseLayer, modelInputsLayer, providersLayer, threadsLayer, usageLayer),
    ),
  );
  const turnsLayer = TurnService.layer.pipe(
    Layer.provide(Layer.mergeAll(databaseLayer, generationsLayer, threadsLayer)),
  );
  const storageLayer = createStorageLayer(databasePath, cacheOptions.path, storageAreas).pipe(
    Layer.provide(Layer.mergeAll(databaseLayer, providersLayer, resourceCacheLayer)),
  );

  return Layer.mergeAll(
    campaignsLayer,
    promptsLayer,
    providersLayer,
    storageLayer,
    threadsLayer,
    turnsLayer,
    usageLayer,
  );
}

export async function createBackend(
  { databasePath, cache: cacheOptions, providers, storageAreas }: BackendOptions,
  signal?: AbortSignal,
): Promise<Backend> {
  signal?.throwIfAborted();
  assertStoragePathsAreDisjoint([
    { id: "content", paths: getDatabaseStoragePaths(databasePath) },
    { id: "cache", paths: getCacheStoragePaths(cacheOptions.path) },
    ...providers.map((provider) => ({
      id: `provider:${provider.id}`,
      paths: provider.storagePaths,
    })),
    ...storageAreas.map(({ id, paths }) => ({ id, paths })),
  ]);
  const runtime = ManagedRuntime.make(
    createBackendLayer({ databasePath, cache: cacheOptions, providers, storageAreas }),
  );
  let services: BackendCapabilities;

  try {
    services = await runtime.runPromise(readBackendCapabilities, { signal });
  } catch (cause) {
    let startupFailure = cause;

    if (signal?.aborted) {
      startupFailure = signal.reason;
    }

    const cleanupFailures: unknown[] = [startupFailure];

    try {
      await runtime.dispose();
    } catch (disposeCause) {
      cleanupFailures.push(disposeCause);
    }

    if (cleanupFailures.length > 1) {
      throw new AggregateError(
        cleanupFailures,
        "Could not close the backend after it failed to start.",
      );
    }

    throw asError(startupFailure, "Could not start the backend.");
  }

  const measureStorageUsage = StorageService.use((storage) => storage.measureUsage());
  let state: "open" | "closing" | "closed" = "open";
  let closePromise: Promise<void> | undefined;
  let terminalFailure: unknown;

  function assertOpen() {
    if (state !== "open") {
      throw new Error("Backend is closed.");
    }
  }

  return {
    campaigns: {
      start(input) {
        assertOpen();
        return services.campaigns.start(input);
      },
      list(request) {
        assertOpen();
        return services.campaigns.list(request);
      },
      get(id) {
        assertOpen();
        return services.campaigns.get(id);
      },
      delete(id) {
        assertOpen();
        const campaign = services.campaigns.get(id);

        if (!campaign) {
          return null;
        }

        if (services.turns.inspect(campaign.threadId).state !== "idle") {
          throw new Error("Campaign cannot be deleted while its thread has an active operation.");
        }

        return services.campaigns.delete(id);
      },
      rename(id, title) {
        assertOpen();
        return services.campaigns.rename(id, title);
      },
      setGenerationPreferences(id, preferences) {
        assertOpen();
        return services.campaigns.setGenerationPreferences(id, preferences);
      },
    },
    campaignUsage: {
      get(id) {
        assertOpen();
        return services.campaignUsage.get(id);
      },
    },
    usage: {
      getOverview(period) {
        assertOpen();
        return services.usage.getOverview(period);
      },
      clear() {
        assertOpen();
        return services.usage.clear();
      },
      subscribe(listener) {
        assertOpen();
        return services.usage.subscribe(listener);
      },
    },
    prompts: {
      listKinds() {
        assertOpen();
        return services.prompts.listKinds();
      },
      list(request) {
        assertOpen();
        return services.prompts.list(request);
      },
      get(key) {
        assertOpen();
        return services.prompts.get(key);
      },
      create(input) {
        assertOpen();
        return services.prompts.create(input);
      },
      update(id, input) {
        assertOpen();
        return services.prompts.update(id, input);
      },
      delete(id) {
        assertOpen();
        return services.prompts.delete(id);
      },
      getDefault(kind) {
        assertOpen();
        return services.prompts.getDefault(kind);
      },
      setDefault(kind, promptKey) {
        assertOpen();
        return services.prompts.setDefault(kind, promptKey);
      },
      getCampaignSelection(campaignId, kind) {
        assertOpen();
        return services.prompts.getCampaignSelection(campaignId, kind);
      },
      setCampaignSelection(input) {
        assertOpen();
        return services.prompts.setCampaignSelection(input);
      },
    },
    threads: {
      create() {
        assertOpen();
        return services.threads.create();
      },
      get(id) {
        assertOpen();
        return services.threads.get(id);
      },
      listMessages(request) {
        assertOpen();
        return services.threads.listMessages(request);
      },
      getTranscript(threadId) {
        assertOpen();
        return services.threads.getTranscript(threadId);
      },
    },
    turns: {
      inspect(threadId) {
        assertOpen();
        return services.turns.inspect(threadId);
      },
      listForThread(request) {
        assertOpen();
        return services.turns.listForThread(request);
      },
      deleteFrom(request) {
        assertOpen();
        return services.turns.deleteFrom(request);
      },
      submit(request) {
        assertOpen();
        return services.turns.submit(request);
      },
      retry(request) {
        assertOpen();
        return services.turns.retry(request);
      },
      regenerate(request) {
        assertOpen();
        return services.turns.regenerate(request);
      },
    },
    providers: {
      list() {
        assertOpen();
        return services.providers.list();
      },
      inspectConfiguration(providerId) {
        assertOpen();
        return services.providers.inspectConfiguration(providerId);
      },
      configureApiKey(providerId, apiKey, signal) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return services.providers.configureApiKey(providerId, apiKey, signal);
      },
      clearConfiguration(providerId) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return services.providers.clearConfiguration(providerId);
      },
    },
    models: {
      listProviders() {
        assertOpen();
        return services.models.listProviders();
      },
      getModels(providerId, signal) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return services.models.getModels(providerId, signal);
      },
      getModel(reference, signal) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return services.models.getModel(reference, signal);
      },
      refreshModels(providerId, signal) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return services.models.refreshModels(providerId, signal);
      },
      subscribe(listener) {
        assertOpen();
        return services.models.subscribe(listener);
      },
    },
    storage: {
      measureUsage() {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return unwrapExit(runtime.runPromiseExit(measureStorageUsage));
      },
      deleteArea(id: StorageAreaId) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return unwrapExit(
          runtime.runPromiseExit(StorageService.use((storage) => storage.deleteArea(id))),
        );
      },
      deleteCategory(id: StorageCategory) {
        if (state !== "open") {
          return Promise.reject(new Error("Backend is closed."));
        }

        return unwrapExit(
          runtime.runPromiseExit(StorageService.use((storage) => storage.deleteCategory(id))),
        );
      },
    },
    inspect() {
      return {
        state,
        ...(terminalFailure === undefined ? {} : { terminalFailure }),
      };
    },
    close: closeBackend,
    [Symbol.asyncDispose]: closeBackend,
  };

  function closeBackend() {
    if (!closePromise) {
      state = "closing";
      closePromise = runtime
        .dispose()
        .catch((error: unknown) => {
          terminalFailure = error;
          throw error;
        })
        .finally(() => {
          state = "closed";
        });
    }

    return closePromise;
  }
}
