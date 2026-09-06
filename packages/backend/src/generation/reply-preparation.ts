import { Effect } from "effect";
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
  prepare(anchor: ReplyAnchor): Effect.Effect<ModelInput, unknown>;
}>;

export function requireReplyInput(prepared: ModelInput, anchor: ReplyAnchor): ModelInput {
  const input = requireModelInput(prepared);
  if (input.requestMessages !== undefined) {
    throw new TypeError("Reply preparation must contain only conversation context.");
  }
  const currentInput = input.dialogue.at(-1);

  if (currentInput?.role !== "user" || currentInput.messageId !== anchor.inputMessageId) {
    throw new TypeError("A prepared reply must end with its accepted user input.");
  }

  return input;
}

export function createReplyPreparer(
  threads: Pick<ThreadEngine, "getTurnContext">,
  modelInputs: ModelInputResolver,
): ReplyPreparer {
  return {
    prepare: Effect.fn("ReplyPreparer.prepare")(function (anchor) {
      return Effect.try({
        try: () => {
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
        catch: (cause) => cause,
      });
    }),
  };
}
