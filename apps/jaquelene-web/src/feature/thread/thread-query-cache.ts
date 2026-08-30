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
    data.pages.some(
      (page) =>
        page.pageSize !== firstPage.pageSize ||
        page.messageContentMaxLength !== firstPage.messageContentMaxLength ||
        page.messages.length > page.pageSize,
    )
  ) {
    return null;
  }

  const pageSize = firstPage.pageSize;

  const userPage = data.pages.findIndex((page) =>
    page.messages.some(({ id }) => id === state.userMessage.id),
  );

  if (
    userPage > 0 ||
    (operation === "retry" && firstPage.messages.at(-1)?.id !== state.userMessage.id) ||
    (operation === "settle" &&
      settled &&
      state.assistantActivated &&
      userPage === 0 &&
      firstPage.messages.at(-1)?.id !== state.userMessage.id)
  ) {
    return null;
  }

  const latestSequence = firstPage.messages.at(-1)?.sequence;

  if (
    operation === "submit" &&
    userPage === -1 &&
    latestSequence !== undefined &&
    state.userMessage.sequence <= latestSequence
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
  const pages = [...data.pages];
  const pageParams = [...data.pageParams];

  if (messages.length <= pageSize) {
    pages[0] = {
      ...firstPage,
      messages,
      generations: selectGenerations(messages, generations),
    };
  } else {
    const overflowSize = messages.length - pageSize;
    const overflowMessages = messages.slice(0, overflowSize);
    const headMessages = messages.slice(overflowSize);
    const overflowCursor = overflowMessages.at(-1)?.id;

    if (!overflowCursor) {
      return null;
    }

    const nextPage = pages[1];

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
  }

  return { pages, pageParams };
}
