import { eq, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import type { MessageId, ThreadId } from "#backend/id";
import { threadMessageTable, threadTable, type ThreadMessageRecord } from "./schema";

export type MessagePathOptions = Readonly<{
  maximumCount?: number;
  maximumCompletedTurns?: number;
  contentByteBudget?: number;
  allowOversizedAnchor?: boolean;
}>;

type MessagePathRow = ThreadMessageRecord & {
  cumulativeContentBytes: number;
  completedTurns: number;
  depth: number;
};

export function readActiveMessageHead(database: Database, threadId: ThreadId) {
  const thread = database
    .select({
      head: {
        id: threadMessageTable.id,
        author: threadMessageTable.author,
        turnId: threadMessageTable.turnId,
      },
    })
    .from(threadTable)
    .leftJoin(threadMessageTable, eq(threadTable.activeMessageId, threadMessageTable.id))
    .where(eq(threadTable.id, threadId))
    .get();
  if (!thread) throw new RangeError(`Thread "${threadId}" does not exist.`);
  return thread.head;
}

export function listMessagePath(
  database: Pick<Database, "all">,
  threadId: ThreadId,
  anchorMessageId: MessageId,
  direction: "older" | "newer",
  {
    maximumCount,
    maximumCompletedTurns,
    contentByteBudget,
    allowOversizedAnchor = false,
  }: MessagePathOptions = {},
) {
  let countLimit = sql`1`;
  if (maximumCount !== undefined) countLimit = sql`path.depth < ${maximumCount - 1}`;
  let turnLimit = sql`1`;
  let completedTurns = sql`0`;
  if (maximumCompletedTurns !== undefined) {
    if (direction !== "older") throw new TypeError("Completed turns require an older path.");
    turnLimit = sql`path.completed_turns < ${maximumCompletedTurns}`;
    completedTurns = sql`path.completed_turns + CASE
      WHEN path.author = 'assistant' AND next.author = 'user' AND path.turn_id = next.turn_id
      THEN 1 ELSE 0 END`;
  }
  let anchorContentBytes = sql`0`;
  let cumulativeContentBytes = sql`0`;
  let byteLimit = sql`1`;
  let anchorByteLimit = sql`1`;
  if (contentByteBudget !== undefined) {
    anchorContentBytes = sql`octet_length(anchor.content)`;
    cumulativeContentBytes = sql`path.cumulative_content_bytes + octet_length(next.content)`;
    byteLimit = sql`${cumulativeContentBytes} <= ${contentByteBudget}`;
    if (!allowOversizedAnchor) anchorByteLimit = sql`${anchorContentBytes} <= ${contentByteBudget}`;
  }
  let pathJoin = sql`next.id = path.parent_message_id AND next.thread_id = path.thread_id`;
  let anchorIsValid = sql`1`;
  if (direction === "newer") {
    pathJoin = sql`next.id = path.active_child_message_id AND next.thread_id = path.thread_id`;
    anchorIsValid = sql`EXISTS (
      SELECT 1 FROM thread_messages AS parent
      WHERE parent.thread_id = anchor.thread_id
        AND parent.id = anchor.parent_message_id
        AND parent.active_child_message_id = anchor.id
    )`;
  }
  const rows = database.all<MessagePathRow>(sql`
    WITH RECURSIVE message_path (
      id, thread_id, turn_id, parent_message_id, active_child_message_id,
      sequence, author, content, created_at, cumulative_content_bytes, completed_turns, depth
    ) AS (
      SELECT
        anchor.id, anchor.thread_id, anchor.turn_id, anchor.parent_message_id,
        anchor.active_child_message_id, anchor.sequence, anchor.author, anchor.content,
        anchor.created_at, ${anchorContentBytes}, 0, 0
      FROM thread_messages AS anchor
      WHERE anchor.id = ${anchorMessageId} AND anchor.thread_id = ${threadId}
        AND ${anchorIsValid} AND ${anchorByteLimit}

      UNION ALL

      SELECT
        next.id, next.thread_id, next.turn_id, next.parent_message_id,
        next.active_child_message_id, next.sequence, next.author, next.content,
        next.created_at, ${cumulativeContentBytes}, ${completedTurns}, path.depth + 1
      FROM thread_messages AS next
      INNER JOIN message_path AS path ON ${pathJoin}
      WHERE ${countLimit} AND ${turnLimit} AND ${byteLimit}
    )
    SELECT
      id, thread_id AS "threadId", turn_id AS "turnId", parent_message_id AS "parentMessageId",
      active_child_message_id AS "activeChildMessageId", sequence, author, content,
      created_at AS "createdAt", cumulative_content_bytes AS "cumulativeContentBytes",
      completed_turns AS "completedTurns", depth
    FROM message_path
    ORDER BY depth ASC
  `);
  const last = rows.at(-1);
  return {
    records: rows.map(
      ({ cumulativeContentBytes: _bytes, completedTurns: _turns, depth: _depth, ...record }) =>
        record,
    ),
    contentBytes: last?.cumulativeContentBytes ?? 0,
    completedTurns: last?.completedTurns ?? 0,
  };
}

export function toThreadMessage({
  activeChildMessageId: _activeChildMessageId,
  ...message
}: ThreadMessageRecord) {
  return message;
}
