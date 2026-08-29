import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  type SQLiteTableExtraConfigValue,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { MessageId, ThreadId, TurnId } from "@/id";

export const threadMessageAuthors = ["user", "assistant"] as const;

export const threadTable = sqliteTable(
  "threads",
  {
    id: text().$type<ThreadId>().notNull(),
    createdAt: integer("created_at").notNull(),
    lastMessageSequence: integer("last_message_sequence").notNull().default(0),
    activeMessageId: text("active_message_id")
      .$type<MessageId>()
      .references((): AnySQLiteColumn => threadMessageTable.id, { onDelete: "set null" }),
  },
  (thread): SQLiteTableExtraConfigValue[] => [
    primaryKey({ columns: [thread.id] }),
    foreignKey({
      columns: [thread.id, thread.activeMessageId],
      foreignColumns: [threadMessageTable.threadId, threadMessageTable.id],
      name: "threads_active_message_thread_fk",
    }),
    check("threads_created_at_nonnegative", sql`${thread.createdAt} >= 0`),
    check("threads_last_message_sequence_nonnegative", sql`${thread.lastMessageSequence} >= 0`),
  ],
);

export const turnTable = sqliteTable(
  "turns",
  {
    id: text().$type<TurnId>().notNull(),
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (turn) => [
    primaryKey({ columns: [turn.id] }),
    uniqueIndex("turns_thread_id_unique").on(turn.threadId, turn.id),
    check("turns_created_at_nonnegative", sql`${turn.createdAt} >= 0`),
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
    turnId: text("turn_id").$type<TurnId>().notNull(),
    parentMessageId: text("parent_message_id").$type<MessageId>(),
    sequence: integer().notNull(),
    author: text({ enum: threadMessageAuthors }).notNull(),
    content: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (message) => [
    primaryKey({ columns: [message.id] }),
    foreignKey({
      columns: [message.threadId, message.turnId],
      foreignColumns: [turnTable.threadId, turnTable.id],
      name: "thread_messages_turn_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [message.threadId, message.parentMessageId],
      foreignColumns: [message.threadId, message.id],
      name: "thread_messages_parent_fk",
    }),
    uniqueIndex("thread_messages_thread_sequence_unique").on(message.threadId, message.sequence),
    uniqueIndex("thread_messages_thread_id_unique").on(message.threadId, message.id),
    uniqueIndex("thread_messages_turn_id_unique").on(message.turnId, message.id),
    uniqueIndex("thread_messages_turn_user_unique")
      .on(message.turnId)
      .where(sql`${message.author} = 'user'`),
    index("thread_messages_parent_idx").on(message.threadId, message.parentMessageId),
    check("thread_messages_sequence_positive", sql`${message.sequence} > 0`),
    check("thread_messages_author_valid", sql`${message.author} IN ('user', 'assistant')`),
    check(
      "thread_messages_parent_valid",
      sql`${message.author} = 'user' OR ${message.parentMessageId} IS NOT NULL`,
    ),
    check(
      "thread_messages_content_valid",
      sql`length(trim(${message.content})) > 0 AND length(${message.content}) <= 100000`,
    ),
    check("thread_messages_created_at_nonnegative", sql`${message.createdAt} >= 0`),
  ],
);

export type Turn = typeof turnTable.$inferSelect;
export type ThreadMessage = typeof threadMessageTable.$inferSelect;
