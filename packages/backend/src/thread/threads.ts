import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type MessageId, type ThreadId, type TurnId } from "#backend/id";
import {
  threadMessageTable,
  threadTable,
  turnTable,
  type ThreadMessage,
  type ThreadMessageRecord,
  type Turn,
} from "./schema";

export const THREAD_MESSAGE_MAX_CODE_UNITS = 100_000;
export const THREAD_MESSAGE_PAGE_MAX_COUNT = 50;
export const THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET = 128 * 1024;

type ListThreadMessagesRequest = {
  threadId: ThreadId;
  direction: "older" | "newer";
  cursor?: string;
};

export type DeleteThreadHistoryRequest = Readonly<{
  threadId: ThreadId;
  userMessageId: MessageId;
}>;

export type ThreadActivity = Readonly<{
  threadId: ThreadId;
  lastActivityAt: number;
  turnCount: number;
}>;

export type ThreadHistoryDeletion = Readonly<{
  threadId: ThreadId;
  userMessageId: MessageId;
  activeMessageId: MessageId | null;
  deletedTurnCount: number;
  threadActivity: ThreadActivity;
}>;

type AppendAssistantMessageRequest = {
  threadId: ThreadId;
  turnId: TurnId;
  parentMessageId: MessageId;
  activateIfMessageId: MessageId | null;
  content: string;
  createdAt: number;
};

type MessagePathRow = ThreadMessageRecord & {
  cumulativeContentBytes: number;
  depth: number;
};

type ActivePathMessage = Readonly<{ id: MessageId }>;

type ListMessagePathOptions = Readonly<{
  maximumCount?: number;
  contentByteBudget?: number;
}>;

const threadSelection = {
  id: threadTable.id,
  createdAt: threadTable.createdAt,
} as const;

const turnSelection = {
  id: turnTable.id,
  threadId: turnTable.threadId,
  createdAt: turnTable.createdAt,
} as const;

const threadMessageSelection = {
  id: threadMessageTable.id,
  threadId: threadMessageTable.threadId,
  turnId: threadMessageTable.turnId,
  parentMessageId: threadMessageTable.parentMessageId,
  sequence: threadMessageTable.sequence,
  author: threadMessageTable.author,
  content: threadMessageTable.content,
  createdAt: threadMessageTable.createdAt,
} as const;

export function requireThreadMessageContent(content: string) {
  if (content.length > THREAD_MESSAGE_MAX_CODE_UNITS) {
    throw new RangeError(
      `Thread message content cannot exceed ${THREAD_MESSAGE_MAX_CODE_UNITS} UTF-16 code units.`,
    );
  }

  if (!content.trim()) {
    throw new TypeError("Thread message content must contain text.");
  }

  return content;
}

function decodeMessageCursor(cursor: string | undefined) {
  if (cursor === undefined) {
    return undefined;
  }

  try {
    return ids.message.parse(cursor);
  } catch (cause) {
    throw new TypeError("Thread message cursor is invalid.", { cause });
  }
}

function threadNotFound(id: ThreadId) {
  return new RangeError(`Thread "${id}" does not exist.`);
}

function turnNotFound(id: TurnId) {
  return new RangeError(`Turn "${id}" does not exist.`);
}

function listMessagePath(
  database: Pick<Database, "all">,
  threadId: ThreadId,
  anchorMessageId: MessageId,
  direction: "older" | "newer",
  { maximumCount, contentByteBudget }: ListMessagePathOptions = {},
) {
  const countLimit = maximumCount === undefined ? sql`1` : sql`path.depth < ${maximumCount - 1}`;
  const anchorContentBytes =
    contentByteBudget === undefined ? sql`0` : sql`octet_length(anchor.content)`;
  const cumulativeContentBytes =
    contentByteBudget === undefined
      ? sql`0`
      : sql`path.cumulative_content_bytes + octet_length(next.content)`;
  const byteLimit =
    contentByteBudget === undefined
      ? sql`1`
      : sql`
          ${cumulativeContentBytes} <= ${contentByteBudget}
        `;
  const pathJoin =
    direction === "older"
      ? sql`next.id = path.parent_message_id AND next.thread_id = path.thread_id`
      : sql`next.id = path.active_child_message_id AND next.thread_id = path.thread_id`;
  const anchorIsValid =
    direction === "older"
      ? sql`1`
      : sql`EXISTS (
          SELECT 1
          FROM thread_messages AS parent
          WHERE parent.thread_id = anchor.thread_id
            AND parent.id = anchor.parent_message_id
            AND parent.active_child_message_id = anchor.id
        )`;

  const rows = database.all<MessagePathRow>(sql`
    WITH RECURSIVE message_path (
      id,
      thread_id,
      turn_id,
      parent_message_id,
      active_child_message_id,
      sequence,
      author,
      content,
      created_at,
      cumulative_content_bytes,
      depth
    ) AS (
      SELECT
        anchor.id,
        anchor.thread_id,
        anchor.turn_id,
        anchor.parent_message_id,
        anchor.active_child_message_id,
        anchor.sequence,
        anchor.author,
        anchor.content,
        anchor.created_at,
        ${anchorContentBytes},
        0
      FROM thread_messages AS anchor
      WHERE anchor.id = ${anchorMessageId}
        AND anchor.thread_id = ${threadId}
        AND ${anchorIsValid}

      UNION ALL

      SELECT
        next.id,
        next.thread_id,
        next.turn_id,
        next.parent_message_id,
        next.active_child_message_id,
        next.sequence,
        next.author,
        next.content,
        next.created_at,
        ${cumulativeContentBytes},
        path.depth + 1
      FROM thread_messages AS next
      INNER JOIN message_path AS path
        ON ${pathJoin}
      WHERE ${countLimit} AND ${byteLimit}
    )
    SELECT
      id,
      thread_id AS "threadId",
      turn_id AS "turnId",
      parent_message_id AS "parentMessageId",
      active_child_message_id AS "activeChildMessageId",
      sequence,
      author,
      content,
      created_at AS "createdAt",
      cumulative_content_bytes AS "cumulativeContentBytes",
      depth
    FROM message_path
    ORDER BY depth ASC
  `);

  return {
    records: rows.map(
      ({ cumulativeContentBytes: _contentBytes, depth: _depth, ...record }) => record,
    ),
    contentBytes: rows.at(-1)?.cumulativeContentBytes ?? 0,
  };
}

function toThreadMessage({
  activeChildMessageId: _activeChildMessageId,
  ...message
}: ThreadMessageRecord) {
  return message;
}

function allocateMessageSequence(database: Pick<Database, "update">, threadId: ThreadId) {
  const allocation = database
    .update(threadTable)
    .set({ lastMessageSequence: sql`${threadTable.lastMessageSequence} + 1` })
    .where(eq(threadTable.id, threadId))
    .returning({
      sequence: threadTable.lastMessageSequence,
      activeMessageId: threadTable.activeMessageId,
    })
    .get();

  if (!allocation) {
    throw threadNotFound(threadId);
  }

  return allocation;
}

function activateMessage(
  database: Pick<Database, "update">,
  threadId: ThreadId,
  expectedMessageId: MessageId | null,
  message: Pick<ThreadMessage, "createdAt" | "id" | "parentMessageId">,
  turnCountIncrement = 0,
): ThreadActivity | null {
  if ((message.parentMessageId === null) !== (expectedMessageId === null)) {
    return null;
  }

  const expectedHead =
    expectedMessageId === null
      ? isNull(threadTable.activeMessageId)
      : eq(threadTable.activeMessageId, expectedMessageId);
  const movedHead = database
    .update(threadTable)
    .set({
      activeMessageId: message.id,
      lastActivityAt: sql`max(${threadTable.lastActivityAt}, ${message.createdAt})`,
      turnCount: sql`${threadTable.turnCount} + ${turnCountIncrement}`,
    })
    .where(and(eq(threadTable.id, threadId), expectedHead))
    .returning({
      threadId: threadTable.id,
      lastActivityAt: threadTable.lastActivityAt,
      turnCount: threadTable.turnCount,
    })
    .get();

  if (!movedHead) {
    return null;
  }

  if (message.parentMessageId === null) {
    return movedHead;
  }

  if (expectedMessageId === null) {
    throw new Error(`Thread "${threadId}" has an invalid active message path.`);
  }

  const expectedChild =
    expectedMessageId === message.parentMessageId
      ? isNull(threadMessageTable.activeChildMessageId)
      : eq(threadMessageTable.activeChildMessageId, expectedMessageId);

  const selectedChild = database
    .update(threadMessageTable)
    .set({ activeChildMessageId: message.id })
    .where(
      and(
        eq(threadMessageTable.threadId, threadId),
        eq(threadMessageTable.id, message.parentMessageId),
        expectedChild,
      ),
    )
    .returning({ id: threadMessageTable.id })
    .get();

  if (!selectedChild) {
    throw new Error(`Thread "${threadId}" has an invalid active message path.`);
  }

  return movedHead;
}

function deleteThreadHistoryInTransaction(
  database: Pick<Database, "get" | "run" | "select" | "update">,
  { threadId, userMessageId }: DeleteThreadHistoryRequest,
): ThreadHistoryDeletion {
  const target = database
    .select({
      id: threadMessageTable.id,
      parentMessageId: threadMessageTable.parentMessageId,
      author: threadMessageTable.author,
    })
    .from(threadMessageTable)
    .where(and(eq(threadMessageTable.threadId, threadId), eq(threadMessageTable.id, userMessageId)))
    .get();

  if (!target) {
    throw new RangeError(`Message "${userMessageId}" does not exist in thread "${threadId}".`);
  }

  if (target.author !== "user") {
    throw new TypeError(`Message "${userMessageId}" is not a user message.`);
  }

  const activePathMessage = database.get<ActivePathMessage>(sql`
    WITH RECURSIVE active_path (id, parent_message_id) AS (
      SELECT head.id, head.parent_message_id
      FROM threads AS thread
      INNER JOIN thread_messages AS head
        ON head.thread_id = thread.id
        AND head.id = thread.active_message_id
      WHERE thread.id = ${threadId}

      UNION ALL

      SELECT parent.id, parent.parent_message_id
      FROM thread_messages AS parent
      INNER JOIN active_path AS child
        ON parent.thread_id = ${threadId}
        AND parent.id = child.parent_message_id
    )
    SELECT id
    FROM active_path
    WHERE id = ${userMessageId}
    LIMIT 1
  `);

  if (!activePathMessage) {
    throw new RangeError(`User message "${userMessageId}" is not on the active thread path.`);
  }

  const retainedHead = target.parentMessageId
    ? database
        .select({ createdAt: threadMessageTable.createdAt })
        .from(threadMessageTable)
        .where(
          and(
            eq(threadMessageTable.threadId, threadId),
            eq(threadMessageTable.id, target.parentMessageId),
          ),
        )
        .get()
    : database
        .select({ createdAt: threadTable.createdAt })
        .from(threadTable)
        .where(eq(threadTable.id, threadId))
        .get();

  if (!retainedHead) {
    throw new Error(`Thread "${threadId}" has an invalid active message path.`);
  }

  const movedHead = database
    .update(threadTable)
    .set({ activeMessageId: target.parentMessageId, lastActivityAt: retainedHead.createdAt })
    .where(eq(threadTable.id, threadId))
    .run();

  if (movedHead.changes !== 1) {
    throw threadNotFound(threadId);
  }

  if (target.parentMessageId) {
    const clearedPathEdge = database
      .update(threadMessageTable)
      .set({ activeChildMessageId: null })
      .where(
        and(
          eq(threadMessageTable.threadId, threadId),
          eq(threadMessageTable.id, target.parentMessageId),
          eq(threadMessageTable.activeChildMessageId, userMessageId),
        ),
      )
      .run();

    if (clearedPathEdge.changes !== 1) {
      throw new Error(`Thread "${threadId}" has an invalid active message path.`);
    }
  }

  const deletedTurns = database.run(sql`
    WITH RECURSIVE deleted_messages (id, turn_id) AS (
      SELECT id, turn_id
      FROM thread_messages
      WHERE thread_id = ${threadId}
        AND id = ${userMessageId}

      UNION ALL

      SELECT child.id, child.turn_id
      FROM thread_messages AS child
      INNER JOIN deleted_messages AS parent
        ON child.thread_id = ${threadId}
        AND child.parent_message_id = parent.id
    )
    DELETE FROM turns
    WHERE thread_id = ${threadId}
      AND id IN (SELECT DISTINCT turn_id FROM deleted_messages)
  `);
  const deletedTurnCount = Number(deletedTurns.changes);

  if (!Number.isSafeInteger(deletedTurnCount) || deletedTurnCount < 1) {
    throw new Error(`User message "${userMessageId}" did not delete a turn.`);
  }

  const updatedThread = database
    .update(threadTable)
    .set({ turnCount: sql`${threadTable.turnCount} - ${deletedTurnCount}` })
    .where(eq(threadTable.id, threadId))
    .returning({
      threadId: threadTable.id,
      lastActivityAt: threadTable.lastActivityAt,
      turnCount: threadTable.turnCount,
    })
    .get();

  if (!updatedThread) {
    throw threadNotFound(threadId);
  }

  return {
    threadId,
    userMessageId,
    activeMessageId: target.parentMessageId,
    deletedTurnCount,
    threadActivity: updatedThread,
  };
}

export function insertThread(database: Pick<Database, "insert">, createdAt: number) {
  const thread = {
    id: ids.thread.create(),
    createdAt,
    lastActivityAt: createdAt,
    turnCount: 0,
    lastMessageSequence: 0,
    activeMessageId: null,
  };

  database.insert(threadTable).values(thread).run();
  return { id: thread.id, createdAt: thread.createdAt };
}

export function appendAssistantMessageInTransaction(
  database: Pick<Database, "insert" | "select" | "update">,
  {
    threadId,
    turnId,
    parentMessageId,
    activateIfMessageId,
    content: value,
    createdAt,
  }: AppendAssistantMessageRequest,
) {
  const content = requireThreadMessageContent(value);
  const inputMessage = database
    .select({ id: threadMessageTable.id })
    .from(threadMessageTable)
    .where(
      and(
        eq(threadMessageTable.id, parentMessageId),
        eq(threadMessageTable.threadId, threadId),
        eq(threadMessageTable.turnId, turnId),
        eq(threadMessageTable.author, "user"),
      ),
    )
    .get();

  if (!inputMessage) {
    throw new Error(`Turn "${turnId}" does not contain its expected user message.`);
  }

  const allocation = allocateMessageSequence(database, threadId);
  const record: ThreadMessageRecord = {
    id: ids.message.create(),
    threadId,
    turnId,
    parentMessageId,
    activeChildMessageId: null,
    sequence: allocation.sequence,
    author: "assistant" as const,
    content,
    createdAt,
  };

  database.insert(threadMessageTable).values(record).run();
  const message = toThreadMessage(record);
  const threadActivity = activateMessage(database, threadId, activateIfMessageId, message);

  return { message, threadActivity };
}

export function createThreads(database: Database, now: () => number = Date.now) {
  function startTurnInTransaction(
    transaction: Pick<Database, "insert" | "update">,
    threadId: ThreadId,
    value: string,
  ) {
    const content = requireThreadMessageContent(value);
    const createdAt = now();
    const allocation = allocateMessageSequence(transaction, threadId);
    const turn: Turn = {
      id: ids.turn.create(),
      threadId,
      createdAt,
    };
    const record: ThreadMessageRecord = {
      id: ids.message.create(),
      threadId,
      turnId: turn.id,
      parentMessageId: allocation.activeMessageId,
      activeChildMessageId: null,
      sequence: allocation.sequence,
      author: "user",
      content,
      createdAt,
    };
    const message = toThreadMessage(record);

    transaction.insert(turnTable).values(turn).run();
    transaction.insert(threadMessageTable).values(record).run();

    const activity = activateMessage(transaction, threadId, allocation.activeMessageId, message, 1);

    if (!activity) {
      throw new Error(`Thread "${threadId}" changed while its turn was being created.`);
    }

    return { turn, message, activity };
  }

  return {
    create() {
      return insertThread(database, now());
    },

    get(id: ThreadId) {
      return (
        database.select(threadSelection).from(threadTable).where(eq(threadTable.id, id)).get() ??
        null
      );
    },

    getTurnInput(id: TurnId) {
      const storedTurn =
        database
          .select({
            ...turnSelection,
            lastActivityAt: threadTable.lastActivityAt,
            turnCount: threadTable.turnCount,
          })
          .from(turnTable)
          .innerJoin(threadTable, eq(threadTable.id, turnTable.threadId))
          .where(eq(turnTable.id, id))
          .get() ?? null;

      if (!storedTurn) {
        return null;
      }

      const { lastActivityAt, turnCount, ...turn } = storedTurn;

      const message = database
        .select(threadMessageSelection)
        .from(threadMessageTable)
        .where(and(eq(threadMessageTable.turnId, id), eq(threadMessageTable.author, "user")))
        .get();

      if (!message) {
        throw new Error(`Turn "${id}" has no user message.`);
      }

      return {
        turn,
        message,
        activity: { threadId: turn.threadId, lastActivityAt, turnCount },
      };
    },

    startTurn(threadId: ThreadId, value: string) {
      return database.transaction((transaction) =>
        startTurnInTransaction(transaction, threadId, value),
      );
    },

    deleteFrom(request: DeleteThreadHistoryRequest) {
      return database.transaction((transaction) =>
        deleteThreadHistoryInTransaction(transaction, request),
      );
    },

    startTurnInTransaction,

    getTurnContext(turnId: TurnId) {
      const context = database
        .select({
          turnId: turnTable.id,
          threadId: turnTable.threadId,
          inputMessageId: threadMessageTable.id,
        })
        .from(turnTable)
        .leftJoin(
          threadMessageTable,
          and(eq(threadMessageTable.turnId, turnTable.id), eq(threadMessageTable.author, "user")),
        )
        .where(eq(turnTable.id, turnId))
        .get();

      if (!context) {
        throw turnNotFound(turnId);
      }

      if (!context.inputMessageId) {
        throw new Error(`Turn "${turnId}" has no user message.`);
      }

      const inputMessageId = context.inputMessageId;
      const messages = listMessagePath(database, context.threadId, inputMessageId, "older")
        .records.reverse()
        .map(toThreadMessage);

      if (messages.at(-1)?.id !== inputMessageId) {
        throw new Error(`Turn "${turnId}" has an invalid message ancestry.`);
      }

      return { turnId: context.turnId, threadId: context.threadId, inputMessageId, messages };
    },

    listMessages({ threadId, direction, cursor }: ListThreadMessagesRequest) {
      if (direction !== "older" && direction !== "newer") {
        throw new TypeError("Thread message direction is invalid.");
      }

      const cursorMessageId = decodeMessageCursor(cursor);

      if (direction === "newer" && cursorMessageId === undefined) {
        throw new TypeError("A cursor is required when listing newer thread messages.");
      }

      const thread = database
        .select({ activeMessageId: threadTable.activeMessageId })
        .from(threadTable)
        .where(eq(threadTable.id, threadId))
        .get();

      if (!thread) {
        throw threadNotFound(threadId);
      }

      const anchorMessageId = cursorMessageId ?? thread.activeMessageId;

      if (!anchorMessageId) {
        return {
          messages: [],
          messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
          messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
          contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
          contentBytes: 0,
        };
      }

      const page = listMessagePath(database, threadId, anchorMessageId, direction, {
        maximumCount: THREAD_MESSAGE_PAGE_MAX_COUNT,
        contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      });

      if (page.records.length === 0) {
        throw new TypeError("Thread message cursor is invalid.");
      }

      const chronologicalRecords = direction === "older" ? page.records.toReversed() : page.records;
      const oldestMessage = chronologicalRecords[0];
      const newestMessage = chronologicalRecords.at(-1);
      const olderCursor = oldestMessage?.parentMessageId ?? undefined;
      const newerCursor = newestMessage?.activeChildMessageId ?? undefined;

      return {
        messages: chronologicalRecords.map(toThreadMessage),
        messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
        messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
        contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
        contentBytes: page.contentBytes,
        ...(olderCursor ? { olderCursor } : {}),
        ...(newerCursor ? { newerCursor } : {}),
      };
    },
  };
}

export type ThreadEngine = ReturnType<typeof createThreads>;
export type Threads = Pick<ThreadEngine, "create" | "get" | "listMessages">;
