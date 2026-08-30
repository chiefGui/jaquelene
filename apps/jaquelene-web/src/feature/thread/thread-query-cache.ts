import {
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnAcceptance,
  type TurnGeneration,
  type TurnSettlement,
} from "@jaquelene/ipc/renderer";
import type { InfiniteData } from "@tanstack/react-query";

export type ThreadQueryData = InfiniteData<ThreadMessagePage, string>;
type TurnState = TurnAcceptance | TurnSettlement;

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

function isSettlement(state: TurnState): state is TurnSettlement {
  return "assistantActivated" in state;
}

function compareGenerationOrder(left: TurnGeneration, right: TurnGeneration) {
  return left.startedAt - right.startedAt || left.id.localeCompare(right.id);
}

export function mergeThreadTurnState(
  data: ThreadQueryData,
  threadId: string,
  operation: "submit" | "retry" | "settle",
  state: TurnState,
) {
  const settled = isSettlement(state);
  const completed = state.generation.status === GenerationStatus.Completed;
  const assistantMessage = settled ? state.assistantMessage : undefined;

  if (
    state.turn.threadId !== threadId ||
    state.userMessage.threadId !== threadId ||
    state.userMessage.turnId !== state.turn.id ||
    state.userMessage.author !== ThreadMessageAuthor.User ||
    state.generation.turnId !== state.turn.id ||
    (!settled && state.generation.status !== GenerationStatus.Pending) ||
    (settled && state.generation.status === GenerationStatus.Pending) ||
    (settled && completed !== Boolean(assistantMessage)) ||
    (settled && completed !== state.assistantActivated) ||
    (assistantMessage &&
      (assistantMessage.threadId !== threadId ||
        assistantMessage.turnId !== state.turn.id ||
        assistantMessage.author !== ThreadMessageAuthor.Assistant ||
        assistantMessage.id !== state.generation.outputMessageId ||
        assistantMessage.sequence <= state.userMessage.sequence))
  ) {
    return null;
  }

  const firstPage = data.pages[0];

  if (
    !firstPage ||
    firstPage.messages.length > firstPage.pageSize ||
    (firstPage.messages.length === 0 && data.pages.length > 1)
  ) {
    return null;
  }

  const pageSize = firstPage.pageSize;
  const userIndex = firstPage.messages.findIndex(({ id }) => id === state.userMessage.id);
  const userInFirstPage = userIndex !== -1;
  const latestSequence = firstPage.messages.at(-1)?.sequence;

  if (
    (!userInFirstPage &&
      latestSequence !== undefined &&
      state.userMessage.sequence <= latestSequence) ||
    (operation === "retry" && (!userInFirstPage || userIndex !== firstPage.messages.length - 1)) ||
    (operation === "settle" &&
      settled &&
      state.assistantActivated &&
      userInFirstPage &&
      userIndex !== firstPage.messages.length - 1)
  ) {
    return null;
  }

  const currentGeneration = firstPage.generations.find(({ turnId }) => turnId === state.turn.id);

  if (
    currentGeneration &&
    (compareGenerationOrder(currentGeneration, state.generation) > 0 ||
      (currentGeneration.id === state.generation.id &&
        currentGeneration.status !== GenerationStatus.Pending &&
        state.generation.status === GenerationStatus.Pending))
  ) {
    return data;
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

  upsertMessage(state.userMessage);

  if (assistantMessage) {
    upsertMessage(assistantMessage);
  }

  messages.sort((left, right) => left.sequence - right.sequence);
  const generations = [
    ...firstPage.generations.filter(({ turnId }) => turnId !== state.turn.id),
    state.generation,
  ];

  if (messages.length <= pageSize) {
    const pages = [...data.pages];
    pages[0] = {
      ...firstPage,
      messages,
      generations: selectGenerations(messages, generations),
    };

    return { pages, pageParams: data.pageParams };
  }

  const overflowSize = messages.length - pageSize;
  const overflowMessages = messages.slice(0, overflowSize);
  const headMessages = messages.slice(overflowSize);
  const overflowCursor = overflowMessages.at(-1)?.id;

  if (!overflowCursor) {
    return null;
  }

  const nextPage = data.pages[1];

  if (
    nextPage &&
    (nextPage.pageSize !== pageSize ||
      nextPage.messageContentMaxLength !== firstPage.messageContentMaxLength ||
      nextPage.messages.length > pageSize)
  ) {
    return null;
  }

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

  return { pages, pageParams };
}
