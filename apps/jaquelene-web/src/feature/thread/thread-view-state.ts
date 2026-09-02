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
  replyFailure: ThreadReplyFailureView | null;
  regeneration: ThreadReplyRegenerationView | null;
}>;

type ThreadReplyFailureView = Readonly<{
  generation: FailedTurnGeneration;
  retrying: boolean;
  retryFailed: boolean;
  canRetry: boolean;
}>;

type ThreadReplyRegenerationView = Readonly<{
  status: "available" | "failed" | "pending";
  canRegenerate: boolean;
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
  actionsAvailable: boolean;
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
  actionsAvailable,
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
    const generation = generationByTurn.get(message.turnId);
    const latest = message.id === latestMessage?.id;
    let regeneration: ThreadReplyRegenerationView | null = null;

    if (!fromUser && latest && actionsAvailable) {
      if (generation?.status === GenerationStatus.Pending) {
        regeneration = { status: "pending", canRegenerate: false };
      } else if (generation?.status === GenerationStatus.Failed) {
        regeneration = { status: "failed", canRegenerate: hasModel };
      } else if (
        generation?.status === GenerationStatus.Completed &&
        generation.outputMessageId === message.id
      ) {
        regeneration = { status: "available", canRegenerate: hasModel };
      }
    }

    // A failed first reply leaves its user message at the head. A retained assistant head means
    // the latest failed generation was a regeneration attempt for that turn.
    const failedRegeneration =
      latestMessage?.author === ThreadMessageAuthor.Assistant &&
      latestMessage.turnId === message.turnId &&
      generation?.status === GenerationStatus.Failed;

    if (!fromUser || !isFailedGeneration(generation) || failedRegeneration) {
      messages.push({ message, replyFailure: null, regeneration });
      continue;
    }

    const retrying = retryActivity?.status === "pending" && retryActivity.turnId === message.turnId;
    const canRetry = latest && actionsAvailable && hasModel;

    messages.push({
      message,
      regeneration,
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
      latestMessage !== undefined &&
      generationByTurn.get(latestMessage.turnId)?.status === GenerationStatus.Pending,
    messageMaxCodeUnits: newestPage.messageMaxCodeUnits,
  };
}
