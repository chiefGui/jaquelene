import { Context, Effect, Layer } from "effect";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import { CampaignService } from "#backend/campaign/subsystem";
import type { ThreadId } from "#backend/id";
import type { PromptApplicationRegistry } from "#backend/prompt/application-registry";
import { PromptService } from "#backend/prompt/subsystem";
import {
  requireModelInput,
  toModelDialogue,
  type ModelInputSourceMessage,
  type ModelInput,
} from "#backend/model/input";

export type ResolveModelInputRequest = Readonly<{
  threadId: ThreadId;
  messages: readonly ModelInputSourceMessage[];
}>;

export type ModelInputResolver = Readonly<{
  resolve(request: ResolveModelInputRequest): ModelInput;
}>;

export function createModelInputResolver(
  campaigns: Pick<CampaignEngine, "getContextForThread">,
  promptApplications: Pick<PromptApplicationRegistry, "resolve">,
): ModelInputResolver {
  return {
    resolve({ threadId, messages }) {
      const campaign = campaigns.getContextForThread(threadId);
      const instructions = [...promptApplications.resolve({ threadId, campaign })];
      if (campaign?.scenario) {
        instructions.push({
          sourceKey: `campaign.${campaign.id}.scenario`,
          content: `## Scenario\n${campaign.scenario}`,
        });
      }
      return requireModelInput({
        instructions,
        dialogue: toModelDialogue(messages),
      });
    },
  };
}

export class ModelInputService extends Context.Service<ModelInputService, ModelInputResolver>()(
  "@jaquelene/backend/ModelInputs",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const campaigns = yield* CampaignService;
      const prompts = yield* PromptService;
      return ModelInputService.of(
        createModelInputResolver(campaigns.campaigns, prompts.applications),
      );
    }),
  );
}
