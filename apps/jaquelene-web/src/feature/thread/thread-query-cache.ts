import {
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnGeneration,
} from "@jaquelene/ipc/renderer";
import type { InfiniteData } from "@tanstack/react-query";

export type ThreadQueryData = InfiniteData<ThreadMessagePage, string>;
export type ThreadTurnUpdate =
  | Readonly<{
      type: "submission-accepted" | "reply-failed";
      userMessage: ThreadMessage;
      generation: TurnGeneration;
    }>
  | Readonly<{
      type: "retry-accepted";
      generation: TurnGeneration;
    }>
  | Readonly<{
      type: "reply-completed";
      userMessage: ThreadMessage;
      assistantMessage: ThreadMessage;
      generation: TurnGeneration;
    }>;

export type ThreadCacheReconciliation =
  | Readonly<{ outcome: "updated"; data: ThreadQueryData }>
  | Readonly<{ outcome: "current" }>
  | Readonly<{ outcome: "reload" }>;

const CURRENT = { outcome: "current" } as const;
const RELOAD = { outcome: "reload" } as const;

function selectGenerations(
  messages: readonly ThreadMessage[],
  generations: readonly TurnGeneration[],
) {
  const generationByTurn = new Map(
    generations.map((generation) => [generation.turnId, generation]),
  );

  return [...new Set(messages.map(({ turnId }) => turnId))].flatMap((turnId) => {
    const generation = generationByTurn.get(turnId);
    return generation ? [generation] : [];
  });
}

function compareGenerationOrder(left: TurnGeneration, right: TurnGeneration) {
  return left.startedAt - right.startedAt || left.id.localeCompare(right.id);
}

function isReplyCompletion(
  update: ThreadTurnUpdate,
): update is Extract<ThreadTurnUpdate, { type: "reply-completed" }> {
  return update.type === "reply-completed";
}

export function reconcileThreadTurn(
  data: ThreadQueryData,
  update: ThreadTurnUpdate,
): ThreadCacheReconciliation {
  const firstPage = data.pages[0];

  if (!firstPage) {
    return RELOAD;
  }

  const pageSize = firstPage.pageSize;
  const currentGeneration = firstPage.generations.find(
    ({ turnId }) => turnId === update.generation.turnId,
  );

  if (
    currentGeneration &&
    (compareGenerationOrder(currentGeneration, update.generation) > 0 ||
      (currentGeneration.id === update.generation.id &&
        currentGeneration.status !== GenerationStatus.Pending &&
        update.generation.status === GenerationStatus.Pending))
  ) {
    return CURRENT;
  }

  const userMessage =
    update.type === "retry-accepted"
      ? firstPage.messages.find(
          ({ author, turnId }) =>
            author === ThreadMessageAuthor.User && turnId === update.generation.turnId,
        )
      : update.userMessage;

  if (!userMessage) {
    return RELOAD;
  }

  const userIndex = firstPage.messages.findIndex(({ id }) => id === userMessage.id);
  const latestMessage = firstPage.messages.at(-1);

  if (
    userIndex === -1 &&
    latestMessage !== undefined &&
    userMessage.sequence <= latestMessage.sequence
  ) {
    return RELOAD;
  }

  if (update.type === "retry-accepted" && userIndex !== firstPage.messages.length - 1) {
    return RELOAD;
  }

  if (
    isReplyCompletion(update) &&
    userIndex !== -1 &&
    userIndex !== firstPage.messages.length - 1
  ) {
    return RELOAD;
  }

  const messages = [...firstPage.messages];

  function upsertMessage(message: ThreadMessage) {
    const index = messages.findIndex(({ id }) => id === message.id);

    if (index === -1) {
      messages.push(message);
    } else {
      messages[index] = message;
    }
  }

  upsertMessage(userMessage);

  if (isReplyCompletion(update)) {
    upsertMessage(update.assistantMessage);
  }

  messages.sort((left, right) => left.sequence - right.sequence);
  const generations = [
    ...firstPage.generations.filter(({ turnId }) => turnId !== update.generation.turnId),
    update.generation,
  ];

  if (messages.length <= pageSize) {
    const pages = [...data.pages];
    pages[0] = {
      ...firstPage,
      messages,
      generations: selectGenerations(messages, generations),
    };

    return { outcome: "updated", data: { pages, pageParams: data.pageParams } };
  }

  const overflowSize = messages.length - pageSize;
  const overflowMessages = messages.slice(0, overflowSize);
  const headMessages = messages.slice(overflowSize);
  const overflowCursor = overflowMessages.at(-1)?.id;

  if (!overflowCursor) {
    return RELOAD;
  }

  const nextPage = data.pages[1];
  const pages = [...data.pages];
  const pageParams = [...data.pageParams];

  if (nextPage && nextPage.messages.length + overflowMessages.length <= pageSize) {
    const nextMessages = [...nextPage.messages, ...overflowMessages];
    pages[0] = {
      ...firstPage,
      messages: headMessages,
      generations: selectGenerations(headMessages, generations),
      nextCursor: overflowCursor,
    };
    pages[1] = {
      ...nextPage,
      messages: nextMessages,
      generations: selectGenerations(nextMessages, [...nextPage.generations, ...generations]),
    };
    pageParams[1] = overflowCursor;
  } else {
    pages[0] = {
      ...firstPage,
      messages: headMessages,
      generations: selectGenerations(headMessages, generations),
      nextCursor: overflowCursor,
    };
    pages.splice(1, 0, {
      messages: overflowMessages,
      generations: selectGenerations(overflowMessages, generations),
      pageSize,
      messageContentMaxLength: firstPage.messageContentMaxLength,
      ...(firstPage.nextCursor ? { nextCursor: firstPage.nextCursor } : {}),
    });
    pageParams.splice(1, 0, overflowCursor);
  }

  return { outcome: "updated", data: { pages, pageParams } };
}
