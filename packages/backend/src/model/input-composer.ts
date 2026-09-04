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

export type ComposeModelInputRequest = Readonly<{
  threadId: ThreadId;
  messages: readonly ModelInputSourceMessage[];
}>;

export type ModelInputComposer = Readonly<{
  compose(request: ComposeModelInputRequest): ModelInput;
}>;

export function createModelInputComposer(
  campaigns: Pick<CampaignEngine, "getContextForThread">,
  promptApplications: Pick<PromptApplicationRegistry, "resolve">,
): ModelInputComposer {
  return {
    compose({ threadId, messages }) {
      return requireModelInput({
        instructions: promptApplications.resolve({
          threadId,
          campaign: campaigns.getContextForThread(threadId),
        }),
        dialogue: messages.map(({ id: messageId, author: role, content }) => ({
          messageId,
          role,
          content,
        })),
      });
    },
  };
}

export class ModelInputService extends Context.Service<ModelInputService, ModelInputComposer>()(
  "@jaquelene/backend/ModelInputs",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const campaigns = yield* CampaignService;
      const prompts = yield* PromptService;
      return ModelInputService.of(
        createModelInputComposer(campaigns.campaigns, prompts.applications),
      );
    }),
  );
}
