import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "@/database";
import { ids, type ThreadId } from "@/id";
import { threadMessageTable, threadTable, type ThreadMessage } from "./schema";

export const THREAD_MESSAGE_CONTENT_MAX_LENGTH = 100_000;
export const THREAD_MESSAGE_PAGE_SIZE = 50;

type ListThreadMessagesRequest = {
  threadId: ThreadId;
  before?: string;
};

type AppendThreadMessageRequest = {
  threadId: ThreadId;
  author: ThreadMessage["author"];
  content: string;
  createdAt: number;
  expectedSequence?: number;
};

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

  if (!/^[1-9]\d*$/.test(cursor)) {
    throw new TypeError("Thread message cursor is invalid.");
  }

  const sequence = Number(cursor);

  if (!Number.isSafeInteger(sequence)) {
    throw new TypeError("Thread message cursor is invalid.");
  }

  return sequence;
}

function threadNotFound(id: ThreadId) {
  return new RangeError(`Thread "${id}" does not exist.`);
}

function threadExists(database: Database, id: ThreadId) {
  return Boolean(
    database.select({ id: threadTable.id }).from(threadTable).where(eq(threadTable.id, id)).get(),
  );
}

export class ThreadSequenceConflictError extends Error {
  constructor(threadId: ThreadId, expectedSequence: number) {
    super(`Thread "${threadId}" no longer ends at message ${expectedSequence}.`);
    this.name = "ThreadSequenceConflictError";
  }
}

export function insertThread(database: Pick<Database, "insert">, createdAt: number) {
  const thread = {
    id: ids.thread.create(),
    createdAt,
    lastMessageSequence: 0,
  };

  database.insert(threadTable).values(thread).run();
  return { id: thread.id, createdAt: thread.createdAt };
}

export function appendThreadMessageInTransaction(
  database: Pick<Database, "insert" | "update">,
  { threadId, author, content: value, createdAt, expectedSequence }: AppendThreadMessageRequest,
) {
  const content = requireThreadMessageContent(value);
  const predicate =
    expectedSequence === undefined
      ? eq(threadTable.id, threadId)
      : and(eq(threadTable.id, threadId), eq(threadTable.lastMessageSequence, expectedSequence));
  const allocation = database
    .update(threadTable)
    .set({
      lastMessageSequence: sql`${threadTable.lastMessageSequence} + 1`,
    })
    .where(predicate)
    .returning({ sequence: threadTable.lastMessageSequence })
    .get();

  if (!allocation) {
    if (expectedSequence !== undefined) {
      throw new ThreadSequenceConflictError(threadId, expectedSequence);
    }

    throw threadNotFound(threadId);
  }

  const message = {
    id: ids.message.create(),
    threadId,
    sequence: allocation.sequence,
    author,
    content,
    createdAt,
  };

  database.insert(threadMessageTable).values(message).run();
  return message;
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

    appendUserMessage(threadId: ThreadId, value: string) {
      return database.transaction((transaction) =>
        appendThreadMessageInTransaction(transaction, {
          threadId,
          author: "user",
          content: value,
          createdAt: now(),
        }),
      );
    },

    listAllMessages(threadId: ThreadId) {
      const messages = database
        .select()
        .from(threadMessageTable)
        .where(eq(threadMessageTable.threadId, threadId))
        .orderBy(asc(threadMessageTable.sequence))
        .all();

      if (messages.length === 0 && !threadExists(database, threadId)) {
        throw threadNotFound(threadId);
      }

      return messages;
    },

    listMessages({ threadId, before }: ListThreadMessagesRequest) {
      const beforeSequence = decodeBeforeCursor(before);
      const predicate =
        beforeSequence === undefined
          ? eq(threadMessageTable.threadId, threadId)
          : and(
              eq(threadMessageTable.threadId, threadId),
              lt(threadMessageTable.sequence, beforeSequence),
            );
      const newestFirst = database
        .select()
        .from(threadMessageTable)
        .where(predicate)
        .orderBy(desc(threadMessageTable.sequence))
        .limit(THREAD_MESSAGE_PAGE_SIZE + 1)
        .all();

      if (newestFirst.length === 0 && !threadExists(database, threadId)) {
        throw threadNotFound(threadId);
      }

      const hasMore = newestFirst.length > THREAD_MESSAGE_PAGE_SIZE;
      const messages = newestFirst.slice(0, THREAD_MESSAGE_PAGE_SIZE).reverse();
      const oldestMessage = messages[0];

      return {
        messages,
        ...(hasMore && oldestMessage ? { nextCursor: String(oldestMessage.sequence) } : {}),
      };
    },
  };
}

export type Threads = ReturnType<typeof createThreads>;
