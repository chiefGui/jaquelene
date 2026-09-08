import type { Database } from "#backend/database/database";
import type { ThreadId } from "#backend/id";
import { listMessagePath, readActiveMessageHead, toThreadMessage } from "./message-path";
import type { ThreadMessage } from "./schema";

export type HistorySelection =
  | Readonly<{ kind: "messages"; limit: number }>
  | Readonly<{
      kind: "completed-turns";
      limit: number;
      openingScene: "include" | "exclude";
      maximumScannedMessages?: number;
    }>;

export type RecentHistoryOptions = Readonly<{
  selection: HistorySelection;
  contentByteBudget: number;
}>;

export type HistoryBoundary = "start" | "selection-limit" | "byte-limit" | "scan-limit";

export type RecentHistory = Readonly<{
  head: Readonly<Pick<ThreadMessage, "id" | "author" | "turnId">> | null;
  messages: readonly ThreadMessage[];
  boundary: HistoryBoundary;
  scannedMessageCount: number;
  scannedContentBytes: number;
}>;

export type ThreadHistoryReader = Readonly<{
  readRecent(threadId: ThreadId, options: RecentHistoryOptions): RecentHistory;
}>;

const DEFAULT_TURN_SCAN_LIMIT = 1024;

function requirePositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function selectCompletedTurns(
  messages: readonly ThreadMessage[],
  openingScene: "include" | "exclude",
) {
  const selected: ThreadMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.turnId === null) {
      if (openingScene === "include") selected.push(message);
      continue;
    }
    const response = messages[index + 1];
    if (
      message.author === "user" &&
      response?.author === "assistant" &&
      response.turnId === message.turnId &&
      response.parentMessageId === message.id
    ) {
      selected.push(message, response);
      index++;
    }
  }
  return selected;
}

export function createThreadHistoryReader(database: Database): ThreadHistoryReader {
  return {
    readRecent(threadId, { selection, contentByteBudget }) {
      const limit = requirePositiveInteger(selection.limit, "History selection limit");
      requirePositiveInteger(contentByteBudget, "History content byte budget");
      let maximumCount = limit;
      let maximumCompletedTurns: number | undefined;
      if (selection.kind === "completed-turns") {
        maximumCompletedTurns = limit;
        maximumCount = requirePositiveInteger(
          selection.maximumScannedMessages ?? DEFAULT_TURN_SCAN_LIMIT,
          "History scan limit",
        );
      }
      const head = readActiveMessageHead(database, threadId);
      if (!head) {
        return {
          head,
          messages: [],
          boundary: "start",
          scannedMessageCount: 0,
          scannedContentBytes: 0,
        };
      }
      const path = listMessagePath(database, threadId, head.id, "older", {
        maximumCount,
        contentByteBudget,
        ...(maximumCompletedTurns !== undefined && { maximumCompletedTurns }),
      });
      const oldest = path.records.at(-1);
      let boundary: HistoryBoundary = "byte-limit";
      if (oldest?.parentMessageId === null) {
        boundary = "start";
      } else if (selection.kind === "completed-turns" && path.completedTurns === limit) {
        boundary = "selection-limit";
      } else if (path.records.length === maximumCount) {
        boundary = "selection-limit";
        if (selection.kind === "completed-turns") boundary = "scan-limit";
      }
      let messages = path.records.reverse().map(toThreadMessage);
      if (selection.kind === "completed-turns") {
        messages = selectCompletedTurns(messages, selection.openingScene);
      }
      return {
        head,
        messages,
        boundary,
        scannedMessageCount: path.records.length,
        scannedContentBytes: path.contentBytes,
      };
    },
  };
}
