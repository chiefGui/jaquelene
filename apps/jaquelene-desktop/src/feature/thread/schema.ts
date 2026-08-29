import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { MessageId, ThreadId } from "@/id";

export const threadMessageAuthors = ["user", "assistant"] as const;

export const threadTable = sqliteTable(
  "threads",
  {
    id: text().$type<ThreadId>().notNull(),
    createdAt: integer("created_at").notNull(),
    lastMessageSequence: integer("last_message_sequence").notNull().default(0),
  },
  (thread) => [
    primaryKey({ columns: [thread.id] }),
    check("threads_created_at_nonnegative", sql`${thread.createdAt} >= 0`),
    check("threads_last_message_sequence_nonnegative", sql`${thread.lastMessageSequence} >= 0`),
  ],
);

export const threadMessageTable = sqliteTable(
  "thread_messages",
  {
    id: text().$type<MessageId>().notNull(),
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    author: text({ enum: threadMessageAuthors }).notNull(),
    content: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (message) => [
    primaryKey({ columns: [message.id] }),
    uniqueIndex("thread_messages_thread_sequence_unique").on(message.threadId, message.sequence),
    check("thread_messages_sequence_positive", sql`${message.sequence} > 0`),
    check("thread_messages_author_valid", sql`${message.author} IN ('user', 'assistant')`),
    check(
      "thread_messages_content_valid",
      sql`length(trim(${message.content})) > 0 AND length(${message.content}) <= 100000`,
    ),
    check("thread_messages_created_at_nonnegative", sql`${message.createdAt} >= 0`),
  ],
);

export type ThreadMessage = typeof threadMessageTable.$inferSelect;
