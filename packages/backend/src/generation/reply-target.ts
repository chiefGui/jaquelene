import { Effect } from "effect";
import type { MessageId } from "#backend/id";
import { appendAssistantMessageInTransaction } from "#backend/thread/threads";
import { requireReplyInput, type ReplyAnchor, type ReplyPreparer } from "./reply-preparation";
import type { GenerationTarget } from "./target";

type ReplyTargetInput = Readonly<{
  anchor: ReplyAnchor;
  activeMessageId: MessageId | null;
  rewrite?: Readonly<{ content: string; instructions: string }>;
}>;

export function createReplyTarget(
  preparer: ReplyPreparer,
  { anchor: acceptedAnchor, activeMessageId, rewrite }: ReplyTargetInput,
): GenerationTarget {
  const anchor = { ...acceptedAnchor };
  const prepare = Effect.fn("ReplyTarget.prepare")(function* () {
    const prepared = yield* preparer.prepare({ ...anchor });
    return yield* Effect.try({
      try: () => {
        const input = requireReplyInput(prepared, anchor);
        if (!rewrite) {
          return input;
        }
        return {
          ...input,
          requestMessages: [
            { role: "assistant" as const, content: rewrite.content },
            {
              role: "user" as const,
              content:
                "Generate a replacement for the preceding assistant response to the original user request, applying the instructions below. Return the complete replacement response.\n\nInstructions:\n" +
                rewrite.instructions,
            },
          ],
        };
      },
      catch: (cause) => cause,
    });
  });

  return {
    threadId: anchor.threadId,
    prepare: prepare(),
    append(transaction, content, createdAt) {
      return appendAssistantMessageInTransaction(transaction, {
        threadId: anchor.threadId,
        turnId: anchor.turnId,
        parentMessageId: anchor.inputMessageId,
        activateIfMessageId: activeMessageId,
        content,
        createdAt,
      });
    },
  };
}
