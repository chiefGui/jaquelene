import { and, desc, eq, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@/database";
import { threadMessageTable, threadTable } from "./schema";

export const THREAD_MESSAGE_CONTENT_MAX_LENGTH = 100_000;
export const THREAD_MESSAGE_PAGE_SIZE = 50;

type ListThreadMessagesRequest = {
  threadId: string;
  before?: string;
};

const threadSelection = {
  id: threadTable.id,
  createdAt: threadTable.createdAt,
} as const;

function requireMessageContent(content: string) {
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

function threadNotFound(id: string) {
  return new RangeError(`Thread "${id}" does not exist.`);
}

export function insertThread(database: Pick<Database, "insert">, createdAt: number) {
  const thread = {
    id: randomUUID(),
    createdAt,
    lastMessageSequence: 0,
  };

  database.insert(threadTable).values(thread).run();
  return { id: thread.id, createdAt: thread.createdAt };
}

export function createThreads(database: Database, now: () => number = Date.now) {
  return {
    create() {
      return insertThread(database, now());
    },

    get(id: string) {
      return (
        database.select(threadSelection).from(threadTable).where(eq(threadTable.id, id)).get() ??
        null
      );
    },

    appendUserMessage(threadId: string, value: string) {
      const content = requireMessageContent(value);

      return database.transaction((transaction) => {
        const allocation = transaction
          .update(threadTable)
          .set({
            lastMessageSequence: sql`${threadTable.lastMessageSequence} + 1`,
          })
          .where(eq(threadTable.id, threadId))
          .returning({ sequence: threadTable.lastMessageSequence })
          .get();

        if (!allocation) {
          throw threadNotFound(threadId);
        }

        const message = {
          id: randomUUID(),
          threadId,
          sequence: allocation.sequence,
          author: "user",
          content,
          createdAt: now(),
        } as const;

        transaction.insert(threadMessageTable).values(message).run();
        return message;
      });
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

      if (
        newestFirst.length === 0 &&
        !database
          .select({ id: threadTable.id })
          .from(threadTable)
          .where(eq(threadTable.id, threadId))
          .get()
      ) {
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
