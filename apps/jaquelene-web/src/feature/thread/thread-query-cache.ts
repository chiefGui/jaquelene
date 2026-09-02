import {
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnGeneration,
} from "@jaquelene/ipc/renderer";
import type { InfiniteData } from "@tanstack/react-query";

export type ThreadHistoryPageParam =
  | Readonly<{ kind: "latest" }>
  | Readonly<{ kind: "cursor"; direction: "older" | "newer"; cursor: string }>;
export type ThreadQueryData = InfiniteData<ThreadMessagePage, ThreadHistoryPageParam>;
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
      type: "regeneration-accepted";
      assistantMessageId: string;
      generation: TurnGeneration;
    }>
  | Readonly<{
      type: "reply-completed";
      userMessage: ThreadMessage;
      assistantMessage: ThreadMessage;
      generation: TurnGeneration;
    }>;

type ThreadCacheReconciliation =
  | Readonly<{ outcome: "updated"; data: ThreadQueryData }>
  | Readonly<{ outcome: "current" }>
  | Readonly<{ outcome: "historical" }>
  | Readonly<{ outcome: "reload" }>;

const CURRENT = { outcome: "current" } as const;
const HISTORICAL = { outcome: "historical" } as const;
const RELOAD = { outcome: "reload" } as const;
const textEncoder = new TextEncoder();
const contentByteMeasurements = new WeakMap<
  ThreadMessage,
  Readonly<{ content: string; bytes: number }>
>();
export const THREAD_HISTORY_RETAINED_PAGE_LIMIT = 3;
export const THREAD_HISTORY_RETAINED_CONTENT_BYTE_BUDGET = 256 * 1024;
export const latestThreadHistoryPageParam: ThreadHistoryPageParam = { kind: "latest" };

type ThreadPageContract = Readonly<{
  messageCountLimit: number;
  messageMaxCodeUnits: number;
  contentByteBudget: number;
}>;

function messageContentBytes(message: ThreadMessage) {
  const measurement = contentByteMeasurements.get(message);

  if (measurement?.content === message.content) {
    return measurement.bytes;
  }

  const bytes = textEncoder.encode(message.content).byteLength;
  contentByteMeasurements.set(message, { content: message.content, bytes });
  return bytes;
}

function hasSamePageContract(page: ThreadMessagePage, contract: ThreadPageContract) {
  return (
    page.messageCountLimit === contract.messageCountLimit &&
    page.messageMaxCodeUnits === contract.messageMaxCodeUnits &&
    page.contentByteBudget === contract.contentByteBudget
  );
}

function isValidPage(page: ThreadMessagePage, contract: ThreadPageContract) {
  if (!hasSamePageContract(page, contract) || page.messages.length > contract.messageCountLimit) {
    return false;
  }

  let actualContentBytes = 0;
  const messageTurnIds = new Set<string>();

  for (const message of page.messages) {
    if (message.content.length > contract.messageMaxCodeUnits) {
      return false;
    }

    actualContentBytes += messageContentBytes(message);
    messageTurnIds.add(message.turnId);
  }

  const generationTurnIds = new Set<string>();

  for (const generation of page.generations) {
    if (!messageTurnIds.has(generation.turnId) || generationTurnIds.has(generation.turnId)) {
      return false;
    }

    generationTurnIds.add(generation.turnId);
  }

  return (
    (page.messages.length > 0 ||
      (page.olderCursor === undefined && page.newerCursor === undefined)) &&
    page.contentBytes === actualContentBytes &&
    (actualContentBytes <= contract.contentByteBudget || page.messages.length === 1)
  );
}

function pageParamMatchesPage(
  page: ThreadMessagePage,
  pageParam: ThreadHistoryPageParam,
  index: number,
) {
  switch (pageParam.kind) {
    case "latest":
      return index === 0 && page.newerCursor === undefined;
    case "cursor":
      return pageParam.direction === "older"
        ? pageParam.cursor === page.messages.at(-1)?.id
        : pageParam.cursor === page.messages[0]?.id;
  }
}

function loadedMessages(data: ThreadQueryData, threadId: string, contract: ThreadPageContract) {
  if (data.pages.length !== data.pageParams.length) {
    return null;
  }

  for (let index = 0; index < data.pages.length; index += 1) {
    const page = data.pages[index];

    if (!page || !isValidPage(page, contract)) {
      return null;
    }

    const pageParam = data.pageParams[index];

    if (!pageParam || !pageParamMatchesPage(page, pageParam, index)) {
      return null;
    }

    const olderPage = data.pages[index + 1];

    if (
      olderPage &&
      (page.olderCursor !== olderPage.messages.at(-1)?.id ||
        olderPage.newerCursor !== page.messages[0]?.id)
    ) {
      return null;
    }
  }

  const messages: ThreadMessage[] = [];

  for (let index = data.pages.length - 1; index >= 0; index -= 1) {
    messages.push(...data.pages[index]!.messages);
  }

  const messageIndexById = new Map<string, number>();
  let previousSequence = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;

    if (
      message.threadId !== threadId ||
      messageIndexById.has(message.id) ||
      message.sequence <= previousSequence
    ) {
      return null;
    }

    messageIndexById.set(message.id, index);
    previousSequence = message.sequence;
  }

  return { messageIndexById, messages };
}

export function requireValidThreadHistory(data: ThreadQueryData, threadId: string) {
  const firstPage = data.pages[0];

  if (!firstPage) {
    throw new TypeError("A thread message query must contain a page.");
  }

  const contract: ThreadPageContract = {
    messageCountLimit: firstPage.messageCountLimit,
    messageMaxCodeUnits: firstPage.messageMaxCodeUnits,
    contentByteBudget: firstPage.contentByteBudget,
  };

  if (!loadedMessages(data, threadId, contract)) {
    throw new TypeError("Thread message history is inconsistent.");
  }

  return data;
}

function partitionMessages(
  messages: readonly ThreadMessage[],
  { messageCountLimit, contentByteBudget }: ThreadPageContract,
) {
  const partitions: Array<Readonly<{ messages: ThreadMessage[]; contentBytes: number }>> = [];
  let end = messages.length;

  while (end > 0) {
    let start = end - 1;
    let contentBytes = messageContentBytes(messages[start]!);

    while (start > 0 && end - start < messageCountLimit) {
      const candidateBytes = messageContentBytes(messages[start - 1]!);

      if (contentBytes + candidateBytes > contentByteBudget) {
        break;
      }

      start -= 1;
      contentBytes += candidateBytes;
    }

    partitions.push({ messages: messages.slice(start, end), contentBytes });
    end = start;
  }

  return partitions;
}

function rebuildPages(
  messages: readonly ThreadMessage[],
  generations: readonly TurnGeneration[],
  contract: ThreadPageContract,
  oldestCursor: string | undefined,
): ThreadQueryData {
  const partitions = partitionMessages(messages, contract);
  const pages = partitions.map(({ messages: pageMessages, contentBytes }, index) => {
    const newerPartition = partitions[index - 1];
    const olderPartition = partitions[index + 1];
    const newerCursor = newerPartition?.messages[0]?.id;
    const olderCursor = olderPartition?.messages.at(-1)?.id ?? oldestCursor;

    return {
      messages: pageMessages,
      generations: selectGenerations(pageMessages, generations),
      ...contract,
      contentBytes,
      ...(olderCursor ? { olderCursor } : {}),
      ...(newerCursor ? { newerCursor } : {}),
    } satisfies ThreadMessagePage;
  });

  if (pages.length === 0) {
    pages.push({
      messages: [],
      generations: [],
      ...contract,
      contentBytes: 0,
      ...(oldestCursor ? { olderCursor: oldestCursor } : {}),
    });
  }

  return {
    pages,
    pageParams: pages.map((page, index): ThreadHistoryPageParam =>
      index === 0
        ? latestThreadHistoryPageParam
        : {
            kind: "cursor",
            direction: "older",
            cursor: page.messages.at(-1)!.id,
          },
    ),
  };
}

export function isLatestThreadHistory(data: ThreadQueryData) {
  return data.pageParams[0]?.kind === "latest";
}

export function createLatestThreadHistory(
  page: ThreadMessagePage,
  threadId: string,
): ThreadQueryData {
  return requireValidThreadHistory(
    { pages: [page], pageParams: [latestThreadHistoryPageParam] },
    threadId,
  );
}

export function retainThreadHistory(
  data: ThreadQueryData,
  requiredEdge: "newest" | "oldest",
): ThreadQueryData {
  if (data.pages.length <= 1) {
    return data;
  }

  let start = requiredEdge === "newest" ? 0 : data.pages.length - 1;
  let end = start + 1;
  let retainedContentBytes = data.pages[start]?.contentBytes ?? 0;

  while (end - start < THREAD_HISTORY_RETAINED_PAGE_LIMIT) {
    const candidateIndex = requiredEdge === "newest" ? end : start - 1;
    const candidate = data.pages[candidateIndex];

    if (
      !candidate ||
      retainedContentBytes + candidate.contentBytes > THREAD_HISTORY_RETAINED_CONTENT_BYTE_BUDGET
    ) {
      break;
    }

    retainedContentBytes += candidate.contentBytes;

    if (requiredEdge === "newest") {
      end += 1;
    } else {
      start -= 1;
    }
  }

  if (start === 0 && end === data.pages.length) {
    return data;
  }

  return {
    pages: data.pages.slice(start, end),
    pageParams: data.pageParams.slice(start, end),
  };
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

function compareGenerationOrder(left: TurnGeneration, right: TurnGeneration) {
  return left.startedAt - right.startedAt || left.id.localeCompare(right.id);
}

function isReplyCompletion(
  update: ThreadTurnUpdate,
): update is Extract<ThreadTurnUpdate, { type: "reply-completed" }> {
  return update.type === "reply-completed";
}

function isConsistentTurnUpdate(threadId: string, update: ThreadTurnUpdate) {
  if (update.type === "retry-accepted" || update.type === "regeneration-accepted") {
    return update.generation.status === GenerationStatus.Pending;
  }

  const { userMessage, generation } = update;

  if (
    userMessage.threadId !== threadId ||
    userMessage.author !== ThreadMessageAuthor.User ||
    generation.turnId !== userMessage.turnId
  ) {
    return false;
  }

  switch (update.type) {
    case "submission-accepted":
      return generation.status === GenerationStatus.Pending;
    case "reply-failed":
      return generation.status === GenerationStatus.Failed;
    case "reply-completed":
      return (
        generation.status === GenerationStatus.Completed &&
        update.assistantMessage.threadId === threadId &&
        update.assistantMessage.turnId === userMessage.turnId &&
        update.assistantMessage.author === ThreadMessageAuthor.Assistant &&
        update.assistantMessage.id === generation.outputMessageId &&
        update.assistantMessage.sequence > userMessage.sequence
      );
  }
}

export function reconcileThreadTurn(
  data: ThreadQueryData,
  threadId: string,
  update: ThreadTurnUpdate,
): ThreadCacheReconciliation {
  const firstPage = data.pages[0];

  if (!firstPage) {
    return RELOAD;
  }

  if (!isLatestThreadHistory(data)) {
    return HISTORICAL;
  }

  if (!isConsistentTurnUpdate(threadId, update)) {
    return RELOAD;
  }

  const contract: ThreadPageContract = {
    messageCountLimit: firstPage.messageCountLimit,
    messageMaxCodeUnits: firstPage.messageMaxCodeUnits,
    contentByteBudget: firstPage.contentByteBudget,
  };
  const loaded = loadedMessages(data, threadId, contract);

  if (!loaded) {
    return RELOAD;
  }

  const messages = [...loaded.messages];
  const messageIndexById = loaded.messageIndexById;

  const generationByTurn = new Map<string, TurnGeneration>();

  for (const page of data.pages) {
    for (const generation of page.generations) {
      generationByTurn.set(generation.turnId, generation);
    }
  }

  const currentGeneration = generationByTurn.get(update.generation.turnId);

  if (
    currentGeneration &&
    (compareGenerationOrder(currentGeneration, update.generation) > 0 ||
      (currentGeneration.id === update.generation.id &&
        currentGeneration.status !== GenerationStatus.Pending &&
        update.generation.status === GenerationStatus.Pending))
  ) {
    return CURRENT;
  }

  if (update.type === "regeneration-accepted") {
    const assistantIndex = messageIndexById.get(update.assistantMessageId);
    const assistantMessage = assistantIndex === undefined ? undefined : messages[assistantIndex];

    if (
      assistantIndex !== messages.length - 1 ||
      assistantMessage?.author !== ThreadMessageAuthor.Assistant ||
      assistantMessage.turnId !== update.generation.turnId
    ) {
      return RELOAD;
    }

    generationByTurn.set(update.generation.turnId, update.generation);

    return {
      outcome: "updated",
      data: retainThreadHistory(
        rebuildPages(
          messages,
          [...generationByTurn.values()],
          contract,
          data.pages.at(-1)?.olderCursor,
        ),
        "newest",
      ),
    };
  }

  const userMessage =
    update.type === "retry-accepted"
      ? messages.find(
          ({ author, turnId }) =>
            author === ThreadMessageAuthor.User && turnId === update.generation.turnId,
        )
      : update.userMessage;

  if (!userMessage) {
    return RELOAD;
  }

  const userIndex = messageIndexById.get(userMessage.id) ?? -1;
  const latestMessage = messages.at(-1);

  if (
    userIndex === -1 &&
    latestMessage !== undefined &&
    userMessage.sequence <= latestMessage.sequence
  ) {
    return RELOAD;
  }

  if (update.type === "retry-accepted" && userIndex !== messages.length - 1) {
    return RELOAD;
  }

  if (isReplyCompletion(update) && userIndex !== -1 && userIndex !== messages.length - 1) {
    const currentAssistant = messages[userIndex + 1];
    const replacesActiveReply =
      userIndex === messages.length - 2 &&
      currentAssistant?.author === ThreadMessageAuthor.Assistant &&
      currentAssistant.turnId === userMessage.turnId;

    if (!replacesActiveReply) {
      return RELOAD;
    }

    messages.pop();
    messageIndexById.delete(currentAssistant.id);
  }

  function upsertMessage(message: ThreadMessage) {
    const index = messageIndexById.get(message.id);

    if (index === undefined) {
      messageIndexById.set(message.id, messages.length);
      messages.push(message);
    } else {
      messages[index] = message;
    }
  }

  upsertMessage(userMessage);

  if (isReplyCompletion(update)) {
    upsertMessage(update.assistantMessage);
  }

  generationByTurn.set(update.generation.turnId, update.generation);

  return {
    outcome: "updated",
    data: retainThreadHistory(
      rebuildPages(
        messages,
        [...generationByTurn.values()],
        contract,
        data.pages.at(-1)?.olderCursor,
      ),
      "newest",
    ),
  };
}
