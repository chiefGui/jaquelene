import { Context, Effect, Layer } from "effect";
import type { Campaigns } from "#backend/campaign/campaigns";
import { CampaignService } from "#backend/campaign/subsystem";
import type { CampaignUsageReader } from "#backend/campaign/usage";
import { DatabaseService } from "#backend/database/database";
import { GenerationService } from "#backend/generation/subsystem";
import { ModelExecutionService } from "#backend/model/execution";
import { ModelInputService } from "#backend/model/input-resolver";
import { narratorPromptModule } from "#backend/narrator/module";
import { PromptService } from "#backend/prompt/subsystem";
import type { Prompts } from "#backend/prompt/types";
import type { ProviderFactory } from "#backend/provider/provider";
import { ProvidersService, type Models, type Providers } from "#backend/provider/providers";
import { createProviderStorageArea } from "#backend/provider/storage";
import type { ResourceCacheFailure } from "#backend/resource-cache/resource-cache";
import { ResourceCacheService } from "#backend/resource-cache/service";
import type { StorageArea } from "#backend/storage/area";
import { createCacheStorageArea } from "#backend/storage/cache";
import { createContentStorageArea } from "#backend/storage/content";
import { StorageRegistry } from "#backend/storage/registry";
import { StorageService } from "#backend/storage/storage";
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

export type Backend = Readonly<{
  campaigns: Campaigns;
  campaignUsage: CampaignUsageReader;
  usage: Usage;
  prompts: Prompts;
  threads: Threads;
  turns: Turns;
  providers: Providers;
  models: Models;
  storage: StorageService["Service"];
}>;

export class BackendService extends Context.Service<BackendService, Backend>()(
  "@jaquelene/backend/Backend",
) {
  static readonly layer = createBackendLayer;
}

const readBackend = Effect.gen(function* () {
  const campaigns = yield* CampaignService;
  const prompts = yield* PromptService;
  const providers = yield* ProvidersService;
  const storage = yield* StorageService;
  const threads = yield* ThreadService;
  const turns = yield* TurnService;
  const usage = yield* UsageService;
  const campaignEngine = campaigns.campaigns;
  const managedCampaigns: Campaigns = {
    start: campaignEngine.start,
    list: campaignEngine.list,
    get: campaignEngine.get,
    delete(id) {
      const campaign = campaignEngine.get(id);

      if (!campaign) {
        return null;
      }

      if (turns.inspect(campaign.threadId).state !== "idle") {
        throw new Error("Campaign cannot be deleted while its thread has an active operation.");
      }

      return campaignEngine.delete(id);
    },
    rename: campaignEngine.rename,
    setGenerationPreferences: campaignEngine.setGenerationPreferences,
  };

  return BackendService.of({
    campaigns: managedCampaigns,
    campaignUsage: campaigns.usage,
    prompts: prompts.prompts,
    providers: providers.providers,
    models: providers.models,
    storage,
    threads: threads.threads,
    turns,
    usage,
  });
});

function createConfiguredBackendLayer(
  { databasePath, cache: cacheOptions, providers }: BackendOptions,
  registry: StorageRegistry<DatabaseService | ResourceCacheService | ProvidersService>,
) {
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
  const modelExecutionsLayer = ModelExecutionService.layer.pipe(Layer.provide(providersLayer));
  const threadsLayer = ThreadService.layer().pipe(
    Layer.provide(Layer.merge(databaseLayer, modelInputsLayer)),
  );
  const generationsLayer = GenerationService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        databaseLayer,
        modelExecutionsLayer,
        modelInputsLayer,
        threadsLayer,
        usageLayer,
      ),
    ),
  );
  const turnsLayer = TurnService.layer.pipe(
    Layer.provide(Layer.mergeAll(databaseLayer, generationsLayer, threadsLayer)),
  );
  const storageLayer = StorageService.layer(registry).pipe(
    Layer.provide(Layer.mergeAll(databaseLayer, providersLayer, resourceCacheLayer)),
  );
  const backendDependencies = Layer.mergeAll(
    campaignsLayer,
    promptsLayer,
    providersLayer,
    storageLayer,
    threadsLayer,
    turnsLayer,
    usageLayer,
  );

  return Layer.effect(BackendService, readBackend).pipe(Layer.provide(backendDependencies));
}

function createBackendLayer(options: BackendOptions) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const areas: StorageArea<DatabaseService | ResourceCacheService | ProvidersService>[] = [
        createContentStorageArea(options.databasePath),
        createCacheStorageArea(options.cache.path),
        ...options.providers.flatMap((provider) => {
          if (provider.storagePaths === null) {
            return [];
          }
          return [createProviderStorageArea(provider.id, provider.storagePaths)];
        }),
        ...options.storageAreas,
      ];
      const registry = yield* StorageRegistry.make(areas);

      return createConfiguredBackendLayer(options, registry);
    }),
  );
}
