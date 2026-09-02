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

type FailedTurnGeneration = TurnGeneration &
  Readonly<{
    status: GenerationStatus.Failed;
  }>;

type ThreadMessageView = Readonly<{
  message: ThreadMessage;
  fromUser: boolean;
  replyFailure: ThreadReplyFailureView | null;
}>;

type ThreadReplyFailureView = Readonly<{
  generation: FailedTurnGeneration;
  retrying: boolean;
  retryFailed: boolean;
  canRetry: boolean;
}>;

export type ThreadViewState = Readonly<{
  messages: ThreadMessageView[];
  latestMessageId: string | null;
  replyPending: boolean;
  messageMaxCodeUnits: number;
}>;

type ThreadViewStateInput = Readonly<{
  pages: readonly ThreadMessagePage[];
  retryActivity: RetryActivity;
  hasModel: boolean;
}>;

function isFailedGeneration(
  generation: TurnGeneration | undefined,
): generation is FailedTurnGeneration {
  return generation?.status === GenerationStatus.Failed;
}

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
  const messages: ThreadMessageView[] = [];

  for (const message of threadMessages) {
    const fromUser = message.author === ThreadMessageAuthor.User;
    const generation = fromUser ? generationByTurn.get(message.turnId) : undefined;

    if (!isFailedGeneration(generation)) {
      messages.push({ message, fromUser, replyFailure: null });
      continue;
    }

    const latest = message.id === latestMessage?.id;
    const retrying = retryActivity?.status === "pending" && retryActivity.turnId === message.turnId;
    const canRetry = latest && hasModel;

    messages.push({
      message,
      fromUser,
      replyFailure: {
        generation,
        retrying,
        retryFailed:
          canRetry && retryActivity?.status === "failed" && retryActivity.turnId === message.turnId,
        canRetry,
      },
    });
  }

  return {
    messages,
    latestMessageId: latestMessage?.id ?? null,
    replyPending:
      latestMessage?.author === ThreadMessageAuthor.User &&
      generationByTurn.get(latestMessage.turnId)?.status === GenerationStatus.Pending,
    messageMaxCodeUnits: newestPage.messageMaxCodeUnits,
  };
}
