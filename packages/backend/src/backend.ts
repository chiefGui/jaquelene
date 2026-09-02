import { Cause, Context, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { createCampaigns, type CampaignEngine, type Campaigns } from "#backend/campaign/campaigns";
import { createCampaignUsage, type CampaignUsageReader } from "#backend/campaign/usage";
import { DatabaseService, getDatabaseStoragePaths } from "#backend/database/database";
import { createReplyPreparer } from "#backend/generation/reply-preparation";
import { createGenerationSubsystem } from "#backend/generation/subsystem";
import type { ProviderFactory } from "#backend/provider/provider";
import { ProvidersService, type Models, type Providers } from "#backend/provider/providers";
import type { ResourceCacheFailure } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
import { getCacheStoragePaths } from "#backend/resource-cache/sqlite-cache-store";
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
import type { PromptApplicationRegistry } from "#backend/prompt/application-registry";
import { narratorPromptModule } from "#backend/prompt/narrator";
import type { PromptEngine } from "#backend/prompt/prompts";
import { createPromptSubsystem } from "#backend/prompt/subsystem";
import type { Prompts } from "#backend/prompt/types";
import { createThreads, type ThreadEngine, type Threads } from "#backend/thread/threads";
import { createTurns, type Turns } from "#backend/turn/turns";
import { createUsageHistory, type Usage } from "#backend/usage/history";

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

type BackendServices = Readonly<{
  campaigns: CampaignEngine;
  campaignUsage: CampaignUsageReader;
  usage: Usage;
  prompts: PromptEngine;
  promptApplications: PromptApplicationRegistry;
  threads: ThreadEngine;
  turns: Turns;
  providers: Providers;
  models: Models;
  close: () => Promise<void>;
}>;

class BackendService extends Context.Service<BackendService, BackendServices>()(
  "@jaquelene/backend/Services",
) {}

function createBackendServiceLayer() {
  return Layer.effect(
    BackendService,
    Effect.gen(function* () {
      const database = yield* DatabaseService;
      const providers = yield* ProvidersService;

      return yield* Effect.acquireRelease(
        Effect.sync(() => {
          const { applications: promptApplications, prompts } = createPromptSubsystem(database, [
            narratorPromptModule,
          ]);
          const campaigns = createCampaigns(database);
          const campaignUsage = createCampaignUsage(database);
          const usage = createUsageHistory(database);
          const threads = createThreads(database);
          const generationSubsystem = createGenerationSubsystem({
            database,
            replyPreparer: createReplyPreparer(threads, campaigns, promptApplications),
            models: providers.models,
            providers: providers.generations,
            attempts: usage.attempts,
          });
          const turns = createTurns(database, threads, generationSubsystem.replies);

          return BackendService.of({
            campaigns,
            campaignUsage,
            usage,
            promptApplications,
            prompts,
            threads,
            turns,
            providers: providers.providers,
            models: providers.models,
            close: generationSubsystem.close,
          });
        }),
        (application) => Effect.promise(() => application.close()),
      );
    }),
  );
}

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

function waitForAbort<Value>(result: Promise<Value>, signal?: AbortSignal) {
  if (!signal) {
    return result;
  }

  if (signal.aborted) {
    result.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  let removeListener: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interrupted]).finally(removeListener);
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
  const databaseLayer = DatabaseService.layer(databasePath);
  const resourceCacheLayer = ResourceCacheService.layer(cacheOptions);
  const infrastructureLayer = Layer.merge(databaseLayer, resourceCacheLayer);
  const dependenciesLayer = ProvidersService.layer([...providers]).pipe(
    Layer.provideMerge(infrastructureLayer),
  );
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      createBackendServiceLayer(),
      createStorageLayer(databasePath, cacheOptions.path, [...storageAreas]),
    ).pipe(Layer.provide(dependenciesLayer)),
  );
  let services: BackendServices;

  try {
    services = Context.get(await waitForAbort(runtime.context(), signal), BackendService);
  } catch (cause) {
    const cleanupFailures: unknown[] = [cause];

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

    throw asError(cause, "Could not start the backend.");
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
