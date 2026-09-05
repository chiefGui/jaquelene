import { Context, Effect, Layer } from "effect";
import type { Campaigns } from "#backend/campaign/campaigns";
import { CampaignService } from "#backend/campaign/subsystem";
import type { CampaignUsageReader } from "#backend/campaign/usage";
import { DatabaseService } from "#backend/database/database";
import { GenerationService } from "#backend/generation/subsystem";
import { ModelExecutionService } from "#backend/model/execution";
import { ModelInputService } from "#backend/model/input-resolver";
import { createNarratorApplication, narratorSkillRegistration } from "#backend/narrator/module";
import type { CampaignSkills } from "#backend/campaign/skills";
import { SkillService } from "#backend/skill/subsystem";
import type { Skills } from "#backend/skill/types";
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
import { UsageService, type Usage } from "#backend/usage/subsystem";

export type BackendOptions<StorageRequirements = never> = Readonly<{
  databasePath: string;
  cache: Readonly<{
    path: string;
    reportFailure: (failure: ResourceCacheFailure) => void;
  }>;
  providers: readonly ProviderFactory[];
  storageAreas: readonly StorageArea<StorageRequirements>[];
}>;

export type Backend = Readonly<{
  campaigns: Campaigns;
  campaignUsage: CampaignUsageReader;
  campaignSkills: CampaignSkills;
  usage: Usage;
  skills: Skills;
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
  const skills = yield* SkillService;
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
    campaignSkills: campaigns.skills,
    skills,
    providers: providers.providers,
    models: providers.models,
    storage,
    threads: threads.threads,
    turns,
    usage,
  });
});

function createConfiguredBackendLayer<StorageRequirements>(
  { databasePath, cache: cacheOptions, providers }: BackendOptions<StorageRequirements>,
  registry: StorageRegistry<
    StorageRequirements | DatabaseService | ResourceCacheService | ProvidersService
  >,
) {
  const databaseLayer = DatabaseService.layer(databasePath);
  const resourceCacheLayer = ResourceCacheService.layer(cacheOptions);
  const skillsLayer = SkillService.layer([narratorSkillRegistration]).pipe(
    Layer.provide(databaseLayer),
  );
  const campaignsLayer = CampaignService.layer([createNarratorApplication]).pipe(
    Layer.provide(Layer.merge(databaseLayer, skillsLayer)),
  );
  const usageLayer = UsageService.layer.pipe(Layer.provide(databaseLayer));
  const providersLayer = ProvidersService.layer(providers).pipe(Layer.provide(resourceCacheLayer));
  const modelInputsLayer = ModelInputService.layer.pipe(Layer.provide(campaignsLayer));
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
    skillsLayer,
    providersLayer,
    storageLayer,
    threadsLayer,
    turnsLayer,
    usageLayer,
  );

  return Layer.effect(BackendService, readBackend).pipe(Layer.provide(backendDependencies));
}

function createBackendLayer<StorageRequirements>(options: BackendOptions<StorageRequirements>) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const areas: StorageArea<
        StorageRequirements | DatabaseService | ResourceCacheService | ProvidersService
      >[] = [
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
