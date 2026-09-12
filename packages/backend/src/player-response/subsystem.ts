import { Context, Effect, Layer } from "effect";
import { CampaignService } from "#backend/campaign/subsystem";
import { ModelExecutionService } from "#backend/model/execution";
import { createAccountedModelExecution } from "#backend/model/accounted-execution";
import { ThreadService } from "#backend/thread/subsystem";
import { UsageService } from "#backend/usage/subsystem";
import { createPlayerResponses, type PlayerResponses } from "./player-responses";
import { createPlayerResponseSkill } from "./skill";
import { friendlyResponse } from "./friendly-response";
import { hostileResponse } from "./hostile-response";

export class PlayerResponsesService extends Context.Service<
  PlayerResponsesService,
  PlayerResponses
>()("@jaquelene/backend/PlayerResponses") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const campaigns = yield* CampaignService;
      const threads = yield* ThreadService;
      const modelExecutor = yield* ModelExecutionService;
      const usage = yield* UsageService;
      const dependencies = {
        campaigns: campaigns.campaigns,
        history: threads.threads.history,
        modelExecutor,
        executeModel: createAccountedModelExecution(modelExecutor, usage.attempts),
      };
      return createPlayerResponses(
        [friendlyResponse, hostileResponse].map((definition) =>
          createPlayerResponseSkill(definition, dependencies),
        ),
      );
    }),
  );
}
