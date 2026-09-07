import { Effect } from "effect";
import type { MessageId, ThreadId } from "#backend/id";
import type { ModelInputResolver } from "#backend/model/input-resolver";
import { appendOpeningMessageInTransaction } from "#backend/thread/threads";
import type { GenerationTarget } from "./target";

export function createOpeningTarget(
  modelInputs: ModelInputResolver,
  {
    threadId,
    sourceMessageId,
    content,
    instructions,
  }: Readonly<{
    threadId: ThreadId;
    sourceMessageId: MessageId;
    content: string;
    instructions?: string;
  }>,
): GenerationTarget {
  return {
    threadId,
    prepare: Effect.try({
      try: () => {
        const context = modelInputs.resolve({ threadId, messages: [] });
        let request =
          "Rewrite the preceding opening scene for this campaign. Preserve its starting situation unless the instructions below request changes. Return only the complete replacement opening scene, without advancing the story beyond it.";
        if (instructions !== undefined) {
          request += "\n\nInstructions:\n" + instructions;
        }
        return {
          ...context,
          requestMessages: [
            { role: "assistant" as const, content },
            { role: "user" as const, content: request },
          ],
        };
      },
      catch: (cause) => cause,
    }),
    append(transaction, text, createdAt) {
      return appendOpeningMessageInTransaction(transaction, {
        threadId,
        content: text,
        createdAt,
        replaceMessageId: sourceMessageId,
      });
    },
  };
}
