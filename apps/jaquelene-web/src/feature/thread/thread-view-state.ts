import {
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnGeneration,
} from "@jaquelene/ipc/renderer";

type RetryActivity = Readonly<{
  turnId: string;
  status: "pending" | "failed";
}> | null;

type ThreadMessageView = Readonly<{
  message: ThreadMessage;
  fromUser: boolean;
  reply: Readonly<{
    generation: TurnGeneration;
    retrying: boolean;
    retryFailed: boolean;
    canRetry: boolean;
  }> | null;
}>;

type ThreadViewState = Readonly<{
  messages: ThreadMessageView[];
  latestMessageId: string | undefined;
  replyPending: boolean;
  messageContentMaxLength: number;
}>;

type ThreadViewStateInput = Readonly<{
  pages: readonly ThreadMessagePage[];
  retryActivity: RetryActivity;
  hasModel: boolean;
}>;

export function deriveThreadViewState({
  pages,
  retryActivity,
  hasModel,
}: ThreadViewStateInput): ThreadViewState {
  const newestPage = pages[0];

  if (!newestPage) {
    throw new Error("A thread message query must contain a page.");
  }

  const chronologicalPages = pages.toReversed();
  const generationByTurn = new Map<string, TurnGeneration>();

  for (const page of chronologicalPages) {
    for (const generation of page.generations) {
      generationByTurn.set(generation.turnId, generation);
    }
  }

  const threadMessages = chronologicalPages.flatMap((page) => page.messages);
  const latestMessage = threadMessages.at(-1);

  return {
    messages: threadMessages.map((message) => {
      const fromUser = message.author === ThreadMessageAuthor.User;
      const generation = fromUser ? generationByTurn.get(message.turnId) : undefined;

      if (!generation || generation.status === GenerationStatus.Completed) {
        return { message, fromUser, reply: null };
      }

      const retrying =
        retryActivity?.status === "pending" && retryActivity.turnId === message.turnId;

      return {
        message,
        fromUser,
        reply: {
          generation,
          retrying,
          retryFailed:
            retryActivity?.status === "failed" && retryActivity.turnId === message.turnId,
          canRetry:
            generation.status === GenerationStatus.Failed &&
            message.id === latestMessage?.id &&
            hasModel,
        },
      };
    }),
    latestMessageId: latestMessage?.id,
    replyPending:
      latestMessage?.author === ThreadMessageAuthor.User &&
      generationByTurn.get(latestMessage.turnId)?.status === GenerationStatus.Pending,
    messageContentMaxLength: newestPage.messageContentMaxLength,
  };
}
