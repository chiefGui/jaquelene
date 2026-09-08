import { Context, Effect, Layer } from "effect";
import { CampaignService } from "#backend/campaign/subsystem";
import { ModelExecutionService } from "#backend/model/execution";
import { createAccountedModelExecution } from "#backend/model/accounted-execution";
import { ThreadService } from "#backend/thread/subsystem";
import { UsageService } from "#backend/usage/subsystem";
import { createComposerSkills, type ComposerSkills } from "./composer-skills";
import { createFriendlyResponse } from "./friendly-response";

export class ComposerSkillsService extends Context.Service<ComposerSkillsService, ComposerSkills>()(
  "@jaquelene/backend/ComposerSkills",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const campaigns = yield* CampaignService;
      const threads = yield* ThreadService;
      const modelExecutor = yield* ModelExecutionService;
      const usage = yield* UsageService;
      return createComposerSkills({
        skills: [
          createFriendlyResponse(createAccountedModelExecution(modelExecutor, usage.attempts)),
        ],
        campaigns: campaigns.campaigns,
        threads: threads.engine,
        modelExecutor,
      });
    }),
  );
}
