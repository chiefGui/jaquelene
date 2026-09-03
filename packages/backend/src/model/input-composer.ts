import type { CampaignEngine } from "#backend/campaign/campaigns";
import type { MessageId, ThreadId } from "#backend/id";
import type { PromptApplicationRegistry } from "#backend/prompt/application-registry";
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
