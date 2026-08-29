import type { MessageId, ThreadId, TurnId } from "#backend/id";
import type { Threads } from "#backend/thread/threads";
import type { GenerationMessage } from "./provider";

export type GenerationPrompt = {
  turnId: TurnId;
  threadId: ThreadId;
  inputMessageId: MessageId;
  messages: readonly GenerationMessage[];
};

export type GenerationPromptCompiler = {
  compile(turnId: TurnId, signal?: AbortSignal): GenerationPrompt | Promise<GenerationPrompt>;
};

export function createTurnPromptCompiler(
  threads: Pick<Threads, "getTurnContext">,
): GenerationPromptCompiler {
  return {
    compile(turnId) {
      const context = threads.getTurnContext(turnId);

      return {
        turnId,
        threadId: context.threadId,
        inputMessageId: context.inputMessageId,
        messages: context.messages.map(({ author: role, content }) => ({ role, content })),
      };
    },
  };
}
