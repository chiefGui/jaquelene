import { Context, Effect, Layer } from "effect";
import { CampaignService } from "#backend/campaign/subsystem";
import { ModelExecutionService } from "#backend/model/execution";
import { createAccountedModelExecution } from "#backend/model/accounted-execution";
import { ThreadService } from "#backend/thread/subsystem";
import { UsageService } from "#backend/usage/subsystem";
import { createReactions, type Reactions } from "./reactions";
import { createReactionSkill } from "./skill";
import { friendlyReaction } from "./friendly-reaction";
import { hostileReaction } from "./hostile-reaction";
import { unexpectedReaction } from "./unexpected-reaction";

export class ReactionsService extends Context.Service<ReactionsService, Reactions>()(
  "@jaquelene/backend/Reactions",
) {
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
      return createReactions(
        [friendlyReaction, hostileReaction, unexpectedReaction].map((definition) =>
          createReactionSkill(definition, dependencies),
        ),
      );
    }),
  );
}
