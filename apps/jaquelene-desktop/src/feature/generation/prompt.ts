import type { Threads } from "@/feature/thread/threads";
import type { MessageId, ThreadId, TurnId } from "@/id";
import type { GenerationMessage } from "./provider";

export type GenerationPrompt = {
  turnId: TurnId;
  threadId: ThreadId;
  inputMessageId: MessageId;
  messages: readonly GenerationMessage[];
};

export type GenerationPromptCompiler = {
  compile(turnId: TurnId): GenerationPrompt | Promise<GenerationPrompt>;
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
