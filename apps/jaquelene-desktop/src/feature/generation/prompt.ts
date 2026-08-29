import type { Threads } from "@/feature/thread/threads";
import type { GenerationMessage } from "./provider";

export type GenerationPrompt = {
  threadId: string;
  contextSequence: number;
  messages: readonly GenerationMessage[];
};

export type GenerationPromptCompiler = {
  compile(threadId: string): GenerationPrompt | Promise<GenerationPrompt>;
};

export function createThreadPromptCompiler(
  threads: Pick<Threads, "listAllMessages">,
): GenerationPromptCompiler {
  return {
    compile(threadId) {
      const threadMessages = threads.listAllMessages(threadId);
      const latestMessage = threadMessages.at(-1);

      if (!latestMessage) {
        throw new RangeError(`Thread "${threadId}" has no messages to generate from.`);
      }

      if (latestMessage.author !== "user") {
        throw new RangeError(`Thread "${threadId}" does not end with a user message.`);
      }

      return {
        threadId,
        contextSequence: latestMessage.sequence,
        messages: threadMessages.map(({ author: role, content }) => ({ role, content })),
      };
    },
  };
}
