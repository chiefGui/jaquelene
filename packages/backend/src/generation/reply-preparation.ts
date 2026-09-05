import type { MessageId, ThreadId, TurnId } from "#backend/id";
import { requireModelInput, type ModelInput } from "#backend/model/input";
import type { ModelInputResolver } from "#backend/model/input-resolver";
import type { ThreadEngine } from "#backend/thread/threads";

export type ReplyAnchor = Readonly<{
  turnId: TurnId;
  threadId: ThreadId;
  inputMessageId: MessageId;
}>;

export type ReplyPreparer = Readonly<{
  prepare(anchor: ReplyAnchor, signal?: AbortSignal): ModelInput | Promise<ModelInput>;
}>;

export function requireReplyInput(prepared: ModelInput, anchor: ReplyAnchor): ModelInput {
  const input = requireModelInput(prepared);
  const currentInput = input.dialogue.at(-1);

  if (currentInput?.role !== "user" || currentInput.sourceKey !== anchor.inputMessageId) {
    throw new TypeError("A prepared reply must end with its accepted user input.");
  }

  return input;
}

export function createReplyPreparer(
  threads: Pick<ThreadEngine, "getTurnContext">,
  modelInputs: ModelInputResolver,
): ReplyPreparer {
  return {
    prepare(anchor) {
      const context = threads.getTurnContext(anchor.turnId);

      if (
        context.threadId !== anchor.threadId ||
        context.inputMessageId !== anchor.inputMessageId
      ) {
        throw new Error(`The accepted input for turn "${anchor.turnId}" has changed.`);
      }

      return modelInputs.resolve({
        threadId: anchor.threadId,
        messages: context.messages,
      });
    },
  };
}
