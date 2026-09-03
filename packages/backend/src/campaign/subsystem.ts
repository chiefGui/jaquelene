import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "#backend/database/database";
import { createCampaigns, type CampaignEngine } from "./campaigns";
import { createCampaignUsage, type CampaignUsageReader } from "./usage";

export type CampaignSubsystem = Readonly<{
  campaigns: CampaignEngine;
  usage: CampaignUsageReader;
}>;

export class CampaignService extends Context.Service<CampaignService, CampaignSubsystem>()(
  "@jaquelene/backend/Campaigns",
) {
  static readonly layer = (now: () => number = Date.now) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const database = yield* DatabaseService;

        return CampaignService.of({
          campaigns: createCampaigns(database, now),
          usage: createCampaignUsage(database),
        });
      }),
    );
}
