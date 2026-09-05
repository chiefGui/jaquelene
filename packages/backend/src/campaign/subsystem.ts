import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "#backend/database/database";
import { SkillService } from "#backend/skill/subsystem";
import { createCampaigns, type CampaignEngine } from "./campaigns";
import { createCampaignUsage, type CampaignUsageReader } from "./usage";
import { createCampaignSkills, type CampaignSkillEngine } from "./skills";
import {
  createCampaignInstructionRegistry,
  type CampaignInstructionApplication,
  type CampaignInstructionRegistry,
} from "./instructions";

type CampaignSubsystem = Readonly<{
  campaigns: CampaignEngine;
  skills: CampaignSkillEngine;
  instructions: CampaignInstructionRegistry;
  usage: CampaignUsageReader;
}>;

export class CampaignService extends Context.Service<CampaignService, CampaignSubsystem>()(
  "@jaquelene/backend/Campaigns",
) {
  static readonly layer = (
    applications: readonly ((skills: CampaignSkillEngine) => CampaignInstructionApplication)[],
    now: () => number = Date.now,
  ) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const database = yield* DatabaseService;
        const skills = yield* SkillService;
        const campaignSkills = createCampaignSkills(database, skills);

        return CampaignService.of({
          campaigns: createCampaigns(database, now),
          skills: campaignSkills,
          instructions: createCampaignInstructionRegistry(
            applications.map((create) => create(campaignSkills)),
          ),
          usage: createCampaignUsage(database),
        });
      }),
    );
}
