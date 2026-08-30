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
  kind: "message";
  message: ThreadMessage;
  fromUser: boolean;
}>;

type ThreadReplyView = Readonly<{
  kind: "reply";
  turnId: string;
  generation: TurnGeneration;
  latest: boolean;
  retrying: boolean;
  retryFailed: boolean;
  canRetry: boolean;
}>;

export type ThreadTimelineItem = ThreadMessageView | ThreadReplyView;

export type ThreadViewState = Readonly<{
  items: ThreadTimelineItem[];
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

  const messages = chronologicalPages.flatMap((page) => page.messages);
  const latestMessage = messages.at(-1);
  const items: ThreadTimelineItem[] = [];

  for (const message of messages) {
    const fromUser = message.author === ThreadMessageAuthor.User;
    const messageView: ThreadMessageView = { kind: "message", message, fromUser };
    const generation = fromUser ? generationByTurn.get(message.turnId) : undefined;
    items.push(messageView);

    if (!generation || generation.status === GenerationStatus.Completed) {
      continue;
    }

    const latest = message.id === latestMessage?.id;
    const retrying = retryActivity?.status === "pending" && retryActivity.turnId === message.turnId;
    const canRetry = generation.status === GenerationStatus.Failed && latest && hasModel;

    items.push({
      kind: "reply",
      turnId: message.turnId,
      generation,
      latest,
      retrying,
      retryFailed:
        canRetry && retryActivity?.status === "failed" && retryActivity.turnId === message.turnId,
      canRetry,
    });
  }

  return {
    items,
    replyPending:
      latestMessage?.author === ThreadMessageAuthor.User &&
      generationByTurn.get(latestMessage.turnId)?.status === GenerationStatus.Pending,
    messageContentMaxLength: newestPage.messageContentMaxLength,
  };
}
