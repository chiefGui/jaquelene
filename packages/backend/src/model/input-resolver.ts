import { Context, Effect, Layer } from "effect";
import type { CampaignEngine } from "#backend/campaign/campaigns";
import { CampaignService } from "#backend/campaign/subsystem";
import type { MessageId, ThreadId } from "#backend/id";
import type { PromptApplicationRegistry } from "#backend/prompt/application-registry";
import { PromptService } from "#backend/prompt/subsystem";
import { requireModelInput, type DialogueMessage, type ModelInput } from "#backend/model/input";

export type ModelInputSourceMessage = Readonly<{
  id: MessageId;
  author: DialogueMessage["role"];
  content: string;
}>;

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
      return requireModelInput({
        instructions: promptApplications.resolve({
          threadId,
          campaign: campaigns.getContextForThread(threadId),
        }),
        dialogue: messages.map(({ id: sourceKey, author: role, content }) => ({
          sourceKey,
          role,
          content,
        })),
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
