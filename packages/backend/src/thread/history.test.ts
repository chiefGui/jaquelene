import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import {
  createThreadHistoryReader,
  type HistorySelection,
  type RecentHistoryOptions,
} from "./history";
import {
  appendAssistantMessageInTransaction,
  appendOpeningMessageInTransaction,
  createThreads,
} from "./threads";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) closeDatabase(database);
});

function environment(openingScene?: string) {
  const database = openDatabase(":memory:");
  databases.push(database);
  const threads = createThreads(database);
  const thread = threads.create();
  if (openingScene !== undefined) {
    database.transaction((transaction) =>
      appendOpeningMessageInTransaction(transaction, {
        threadId: thread.id,
        content: openingScene,
        createdAt: 100,
        replaceMessageId: null,
      }),
    );
  }
  const history = createThreadHistoryReader(database);
  function turn(user: string, assistant: string) {
    const started = threads.startTurn(thread.id, user);
    const completed = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: started.turn.id,
        parentMessageId: started.message.id,
        activateIfMessageId: started.message.id,
        content: assistant,
        createdAt: 100,
      }),
    );
    return { user: started.message, assistant: completed.message };
  }
  function read(selection: HistorySelection, contentByteBudget = 32 * 1024) {
    return history.readRecent(thread.id, { selection, contentByteBudget });
  }
  return { database, threads, thread, history, turn, read };
}

const completedTurns = { kind: "completed-turns", limit: 3, openingScene: "include" } as const;

describe("recent thread history", () => {
  it("distinguishes empty history from an unknown thread", () => {
    const env = environment();
    expect(env.read(completedTurns)).toEqual({
      head: null,
      messages: [],
      boundary: "start",
      scannedMessageCount: 0,
      scannedContentBytes: 0,
    });
    expect(() =>
      env.history.readRecent(ids.thread.create(), {
        selection: completedTurns,
        contentByteBudget: 100,
      }),
    ).toThrow("does not exist");
  });

  it("selects five completed turns despite intervening unanswered messages", () => {
    const env = environment();
    const expected = [];
    for (let index = 0; index < 8; index++) {
      const turn = env.turn(`Player ${index}`, `Narrator ${index}`);
      if (index >= 3) expected.push(turn.user, turn.assistant);
      env.threads.startTurn(env.thread.id, `Unanswered ${index}`);
    }
    const result = env.read({ ...completedTurns, limit: 5 });
    expect(result.messages).toEqual(expected);
    expect(result.head?.author).toBe("user");
    expect(result.boundary).toBe("selection-limit");
    expect(result.scannedMessageCount).toBe(15);
  });

  it("selects raw recent messages independently of turn completion", () => {
    const env = environment();
    env.turn("Older input", "Older response");
    const latest = env.turn("Latest input", "Latest response");
    const pending = env.threads.startTurn(env.thread.id, "Unanswered").message;
    const result = env.read({ kind: "messages", limit: 2 });
    expect(result.messages).toEqual([latest.assistant, pending]);
    expect(result.boundary).toBe("selection-limit");
    expect(result.scannedMessageCount).toBe(2);
  });

  it("makes opening scene inclusion explicit and never counts it as a completed turn", () => {
    const env = environment("Opening scene");
    const first = env.turn("Player", "Narrator");
    const included = env.read(completedTurns);
    expect(included.messages.map(({ content }) => content)).toEqual([
      "Opening scene",
      "Player",
      "Narrator",
    ]);
    expect(included.boundary).toBe("start");
    expect(env.read({ ...completedTurns, openingScene: "exclude" }).messages).toEqual([
      first.user,
      first.assistant,
    ]);
    expect(env.read({ ...completedTurns, limit: 1 }).messages).toEqual([
      first.user,
      first.assistant,
    ]);
    expect(env.read({ ...completedTurns, limit: 1 }).boundary).toBe("selection-limit");
    const openingOnly = environment("Only opening");
    expect(openingOnly.read(completedTurns).messages.map(({ content }) => content)).toEqual([
      "Only opening",
    ]);
    expect(openingOnly.read({ ...completedTurns, openingScene: "exclude" }).messages).toEqual([]);
  });

  it("reports the beginning when history exactly fills the requested count", () => {
    const env = environment();
    env.turn("Player", "Narrator");
    expect(env.read({ ...completedTurns, limit: 1 }).boundary).toBe("start");
    expect(env.read({ kind: "messages", limit: 2 }).boundary).toBe("start");
  });

  it("drops a partial older turn at the byte boundary without cutting text", () => {
    const env = environment();
    env.turn("x".repeat(100), "Old");
    const latest = env.turn("New", "Response");
    const result = env.read(completedTurns, 20);
    expect(result.messages).toEqual([latest.user, latest.assistant]);
    expect(result.boundary).toBe("byte-limit");
    expect(result.scannedMessageCount).toBe(3);
    expect(result.scannedContentBytes).toBe(14);
  });

  it("applies byte limits to UTF-8 content, including the first message", () => {
    const env = environment("🐈");
    const tooSmall = env.read({ kind: "messages", limit: 1 }, 3);
    expect(tooSmall.messages).toEqual([]);
    expect(tooSmall.head).toMatchObject({ author: "assistant", turnId: null });
    expect(tooSmall.boundary).toBe("byte-limit");
    expect(tooSmall.scannedContentBytes).toBe(0);
    const exact = env.read({ kind: "messages", limit: 1 }, 4);
    expect(exact.messages.map(({ content }) => content)).toEqual(["🐈"]);
    expect(exact.scannedContentBytes).toBe(4);
    expect(exact.boundary).toBe("start");
  });

  it("returns no partial latest turn when its input cannot fit", () => {
    const env = environment();
    const turn = env.turn("x".repeat(100), "Response");
    const result = env.read(completedTurns, 20);
    expect(result.messages).toEqual([]);
    expect(result.head?.id).toBe(turn.assistant.id);
    expect(result.boundary).toBe("byte-limit");
  });

  it("bounds scanning through unanswered history and exposes the stopping reason", () => {
    const env = environment();
    env.turn("Older input", "Older response");
    for (let index = 0; index < 20; index++)
      env.threads.startTurn(env.thread.id, `Unanswered ${index}`);
    const latest = env.turn("Latest input", "Latest response");
    const result = env.read({ ...completedTurns, maximumScannedMessages: 5 });
    expect(result.messages).toEqual([latest.user, latest.assistant]);
    expect(result.boundary).toBe("scan-limit");
    expect(result.scannedMessageCount).toBe(5);
  });

  it("applies a default scan allowance even when no completed turn is found", () => {
    const env = environment();
    env.database.transaction((transaction) => {
      for (let index = 0; index < 1100; index++) {
        env.threads.startTurnInTransaction(transaction, env.thread.id, "Unanswered");
      }
    });
    const result = env.read(completedTurns);
    expect(result.messages).toEqual([]);
    expect(result.boundary).toBe("scan-limit");
    expect(result.scannedMessageCount).toBe(1024);
  });

  it("reads selected ancestry after regeneration and excludes newer inactive responses", () => {
    const env = environment();
    const first = env.turn("Player", "Original response");
    const replacement = env.database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: env.thread.id,
        turnId: first.user.turnId!,
        parentMessageId: first.user.id,
        activateIfMessageId: first.assistant.id,
        content: "Replacement response",
        createdAt: 200,
      }),
    ).message;
    const continuation = env.turn("Next input", "Next response");
    env.database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: env.thread.id,
        turnId: first.user.turnId!,
        parentMessageId: first.user.id,
        activateIfMessageId: ids.message.create(),
        content: "Newer inactive response",
        createdAt: 300,
      }),
    );
    const expected = [first.user, replacement, continuation.user, continuation.assistant];
    expect(env.read(completedTurns).messages).toEqual(expected);
    expect(env.read({ kind: "messages", limit: 5 }).messages).toEqual(expected);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid limits before querying: %s",
    (invalid) => {
      const env = environment();
      const requests: RecentHistoryOptions[] = [
        { selection: { kind: "messages", limit: invalid }, contentByteBudget: 100 },
        { selection: completedTurns, contentByteBudget: invalid },
        {
          selection: { ...completedTurns, maximumScannedMessages: invalid },
          contentByteBudget: 100,
        },
      ];
      for (const request of requests)
        expect(() => env.history.readRecent(env.thread.id, request)).toThrow(
          "positive safe integer",
        );
    },
  );
});
