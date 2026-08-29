import {
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnGeneration,
  type TurnSubmission,
} from "@jaquelene/ipc/renderer";
import type { InfiniteData } from "@tanstack/react-query";

export type ThreadQueryData = InfiniteData<ThreadMessagePage, string>;

export function hasPendingReply(data: ThreadQueryData | undefined) {
  const latestPage = data?.pages[0];

  if (!latestPage) {
    return false;
  }

  const latestMessage = latestPage.messages.at(-1);

  return (
    latestMessage?.author === ThreadMessageAuthor.User &&
    latestPage.generations.some(
      (generation) =>
        generation.turnId === latestMessage.turnId &&
        generation.status === GenerationStatus.Pending,
    )
  );
}

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

export function mergeThreadSubmission(
  data: ThreadQueryData,
  threadId: string,
  operation: "submit" | "retry",
  submission: TurnSubmission,
) {
  const completed = submission.generation.status === GenerationStatus.Completed;
  const assistantMessage = submission.assistantMessage;

  if (
    submission.turn.threadId !== threadId ||
    submission.userMessage.threadId !== threadId ||
    submission.userMessage.turnId !== submission.turn.id ||
    submission.userMessage.author !== ThreadMessageAuthor.User ||
    submission.generation.turnId !== submission.turn.id ||
    completed !== Boolean(assistantMessage) ||
    completed !== submission.assistantActivated ||
    (assistantMessage &&
      (assistantMessage.threadId !== threadId ||
        assistantMessage.turnId !== submission.turn.id ||
        assistantMessage.author !== ThreadMessageAuthor.Assistant ||
        assistantMessage.id !== submission.generation.outputMessageId ||
        assistantMessage.sequence <= submission.userMessage.sequence))
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
    page.messages.some(({ id }) => id === submission.userMessage.id),
  );

  if (
    userPage > 0 ||
    (operation === "retry" && firstPage.messages.at(-1)?.id !== submission.userMessage.id)
  ) {
    return null;
  }

  const latestSequence = firstPage.messages.at(-1)?.sequence;

  if (
    operation === "submit" &&
    userPage === -1 &&
    latestSequence !== undefined &&
    submission.userMessage.sequence <= latestSequence
  ) {
    return null;
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

  upsertMessage(submission.userMessage);

  if (assistantMessage) {
    upsertMessage(assistantMessage);
  }

  messages.sort((left, right) => left.sequence - right.sequence);
  const generations = [
    ...firstPage.generations.filter(({ turnId }) => turnId !== submission.turn.id),
    submission.generation,
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
