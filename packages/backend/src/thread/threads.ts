import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type MessageId, type ThreadId, type TurnId } from "#backend/id";
import {
  threadMessageTable,
  threadTable,
  turnTable,
  type ThreadMessage,
  type Turn,
} from "./schema";

export const THREAD_MESSAGE_CONTENT_MAX_LENGTH = 100_000;
export const THREAD_MESSAGE_PAGE_SIZE = 50;

type ListThreadMessagesRequest = {
  threadId: ThreadId;
  before?: string;
};

type AppendAssistantMessageRequest = {
  threadId: ThreadId;
  turnId: TurnId;
  parentMessageId: MessageId;
  activateIfMessageId: MessageId | null;
  content: string;
  createdAt: number;
};

type MessagePathRow = ThreadMessage & { depth: number };

const threadSelection = {
  id: threadTable.id,
  createdAt: threadTable.createdAt,
} as const;

export function requireThreadMessageContent(content: string) {
  if (content.length > THREAD_MESSAGE_CONTENT_MAX_LENGTH) {
    throw new RangeError(
      `Thread message content cannot exceed ${THREAD_MESSAGE_CONTENT_MAX_LENGTH} characters.`,
    );
  }

  if (!content.trim()) {
    throw new TypeError("Thread message content must contain text.");
  }

  return content;
}

function decodeBeforeCursor(cursor: string | undefined) {
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

function listMessageAncestry(
  database: Pick<Database, "all">,
  threadId: ThreadId,
  anchorMessageId: MessageId,
  maximumRows?: number,
) {
  const recursionLimit = maximumRows === undefined ? sql`1` : sql`path.depth < ${maximumRows - 1}`;
  const resultLimit = maximumRows === undefined ? sql`` : sql`LIMIT ${maximumRows}`;

  const rows = database.all<MessagePathRow>(sql`
    WITH RECURSIVE message_path (
      id,
      thread_id,
      turn_id,
      parent_message_id,
      sequence,
      author,
      content,
      created_at,
      depth
    ) AS (
      SELECT
        id,
        thread_id,
        turn_id,
        parent_message_id,
        sequence,
        author,
        content,
        created_at,
        0
      FROM thread_messages
      WHERE id = ${anchorMessageId} AND thread_id = ${threadId}

      UNION ALL

      SELECT
        parent.id,
        parent.thread_id,
        parent.turn_id,
        parent.parent_message_id,
        parent.sequence,
        parent.author,
        parent.content,
        parent.created_at,
        path.depth + 1
      FROM thread_messages AS parent
      INNER JOIN message_path AS path
        ON parent.id = path.parent_message_id
        AND parent.thread_id = path.thread_id
      WHERE ${recursionLimit}
    )
    SELECT
      id,
      thread_id AS "threadId",
      turn_id AS "turnId",
      parent_message_id AS "parentMessageId",
      sequence,
      author,
      content,
      created_at AS "createdAt",
      depth
    FROM message_path
    ORDER BY depth ASC
    ${resultLimit}
  `);

  return rows.map(({ depth: _depth, ...message }) => message);
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

function moveActiveHead(
  database: Pick<Database, "update">,
  threadId: ThreadId,
  expectedMessageId: MessageId | null,
  messageId: MessageId,
) {
  const expectedHead =
    expectedMessageId === null
      ? isNull(threadTable.activeMessageId)
      : eq(threadTable.activeMessageId, expectedMessageId);

  return Boolean(
    database
      .update(threadTable)
      .set({ activeMessageId: messageId })
      .where(and(eq(threadTable.id, threadId), expectedHead))
      .returning({ id: threadTable.id })
      .get(),
  );
}

export function insertThread(database: Pick<Database, "insert">, createdAt: number) {
  const thread = {
    id: ids.thread.create(),
    createdAt,
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
  const message = {
    id: ids.message.create(),
    threadId,
    turnId,
    parentMessageId,
    sequence: allocation.sequence,
    author: "assistant" as const,
    content,
    createdAt,
  };

  database.insert(threadMessageTable).values(message).run();
  const activated = moveActiveHead(database, threadId, activateIfMessageId, message.id);

  return { message, activated };
}

export function createThreads(database: Database, now: () => number = Date.now) {
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

    startTurn(threadId: ThreadId, value: string) {
      const content = requireThreadMessageContent(value);
      const createdAt = now();

      return database.transaction((transaction) => {
        const allocation = allocateMessageSequence(transaction, threadId);
        const turn: Turn = {
          id: ids.turn.create(),
          threadId,
          createdAt,
        };
        const message: ThreadMessage = {
          id: ids.message.create(),
          threadId,
          turnId: turn.id,
          parentMessageId: allocation.activeMessageId,
          sequence: allocation.sequence,
          author: "user",
          content,
          createdAt,
        };

        transaction.insert(turnTable).values(turn).run();
        transaction.insert(threadMessageTable).values(message).run();

        if (!moveActiveHead(transaction, threadId, allocation.activeMessageId, message.id)) {
          throw new Error(`Thread "${threadId}" changed while its turn was being created.`);
        }

        return { turn, message };
      });
    },

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
      const messages = listMessageAncestry(database, context.threadId, inputMessageId).reverse();

      if (messages.at(-1)?.id !== inputMessageId) {
        throw new Error(`Turn "${turnId}" has an invalid message ancestry.`);
      }

      return { turnId: context.turnId, threadId: context.threadId, inputMessageId, messages };
    },

    listMessages({ threadId, before }: ListThreadMessagesRequest) {
      const cursorMessageId = decodeBeforeCursor(before);
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
        return { messages: [] };
      }

      const newestFirst = listMessageAncestry(
        database,
        threadId,
        anchorMessageId,
        THREAD_MESSAGE_PAGE_SIZE + 1,
      );

      if (newestFirst.length === 0) {
        throw new TypeError("Thread message cursor is invalid.");
      }

      const hasMore = newestFirst.length > THREAD_MESSAGE_PAGE_SIZE;
      const messages = newestFirst.slice(0, THREAD_MESSAGE_PAGE_SIZE).reverse();
      const nextMessage = newestFirst[THREAD_MESSAGE_PAGE_SIZE];

      return {
        messages,
        ...(hasMore && nextMessage ? { nextCursor: nextMessage.id } : {}),
      };
    },
  };
}

export type Threads = ReturnType<typeof createThreads>;
