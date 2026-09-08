import type { ThreadMessage } from "#backend/thread/schema";
import type { ThreadEngine } from "#backend/thread/threads";
import type { ThreadId } from "#backend/id";
import { ComposerSkillError } from "./error";

export const COMPOSER_CONTEXT_BYTE_BUDGET = 32 * 1024;
export const COMPOSER_CONTEXT_TURN_LIMIT = 3;

export function readComposerConversation(
  threads: Pick<ThreadEngine, "getActiveMessagePath">,
  threadId: ThreadId,
): readonly ThreadMessage[] {
  const messages = threads.getActiveMessagePath(threadId, {
    maximumCount: COMPOSER_CONTEXT_TURN_LIMIT * 2,
    contentByteBudget: COMPOSER_CONTEXT_BYTE_BUDGET,
  });
  const latest = messages.at(-1);
  if (!latest)
    throw new ComposerSkillError({ message: "A conversation is needed to generate a response." });
  if (latest.author !== "assistant")
    throw new ComposerSkillError({
      message: "Complete the latest turn before generating a response.",
    });
  if (Buffer.byteLength(latest.content, "utf8") > COMPOSER_CONTEXT_BYTE_BUDGET) {
    throw new ComposerSkillError({
      message: "The latest turn is too long to generate a response.",
    });
  }
  const completed: ThreadMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.turnId === null && message.author === "assistant") {
      completed.push(message);
      continue;
    }
    const reply = messages[index + 1];
    if (
      message.author === "user" &&
      reply?.author === "assistant" &&
      reply.turnId === message.turnId &&
      reply.parentMessageId === message.id
    ) {
      completed.push(message, reply);
      index++;
    }
  }
  if (completed.at(-1)?.id !== latest.id)
    throw new ComposerSkillError({
      message: "The latest turn is too long to generate a response.",
    });
  return completed;
}
