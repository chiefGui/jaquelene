import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { threadMessageTable, threadTable, turnTable } from "./schema";
import {
  appendAssistantMessageInTransaction,
  createThreads,
  THREAD_MESSAGE_MAX_CODE_UNITS,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "./threads";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-threads-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openThreads(path: string, now: () => number = Date.now) {
  const database = openDatabase(path);
  databases.push(database);

  return {
    database,
    threads: createThreads(database, now),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("threads", () => {
  it("returns the bounded page contract for a thread without messages", () => {
    const { threads } = openThreads(createDatabasePath(), () => 50);
    const thread = threads.create();

    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 0,
    });
  });

  it("creates a campaign-agnostic thread and retrieves it by identity", () => {
    const { threads } = openThreads(createDatabasePath(), () => 100);
    const thread = threads.create();

    expect(thread).toEqual({ id: expect.stringMatching(/^thread_/), createdAt: 100 });
    expect(threads.get(thread.id)).toEqual(thread);
    expect(threads.get(ids.thread.create())).toBeNull();
  });

  it("starts durable turns and links each user message to the active head", () => {
    let timestamp = 200;
    const { database, threads } = openThreads(createDatabasePath(), () => timestamp++);
    const thread = threads.create();
    const otherThread = threads.create();
    const first = threads.startTurn(thread.id, "  First message  ");
    const second = threads.startTurn(thread.id, "Second message");
    threads.startTurn(otherThread.id, "Other thread message");

    expect(first.turn).toEqual({
      id: expect.stringMatching(/^turn_/),
      threadId: thread.id,
      createdAt: 202,
    });
    expect(first.message).toEqual({
      id: expect.stringMatching(/^message_/),
      threadId: thread.id,
      turnId: first.turn.id,
      parentMessageId: null,
      sequence: 1,
      author: "user",
      content: "  First message  ",
      createdAt: 202,
    });
    expect(second.message).toEqual(
      expect.objectContaining({
        turnId: second.turn.id,
        parentMessageId: first.message.id,
        sequence: 2,
      }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [first.message, second.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 31,
    });
    expect(
      database
        .select({
          lastActivityAt: threadTable.lastActivityAt,
          turnCount: threadTable.turnCount,
        })
        .from(threadTable)
        .where(eq(threadTable.id, thread.id))
        .get(),
    ).toEqual({ lastActivityAt: second.message.createdAt, turnCount: 2 });
  });

  it("follows message ancestry for a turn without leaking sibling branches", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 300);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const firstReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: first.turn.id,
        parentMessageId: first.message.id,
        activateIfMessageId: first.message.id,
        content: "First reply",
        createdAt: 301,
      }),
    );
    const second = threads.startTurn(thread.id, "Second user message");
    const siblingReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: first.turn.id,
        parentMessageId: first.message.id,
        activateIfMessageId: ids.message.create(),
        content: "Inactive sibling reply",
        createdAt: 302,
      }),
    );

    expect(firstReply.activated).toBe(true);
    expect(siblingReply.activated).toBe(false);
    expect(
      database
        .select({
          lastActivityAt: threadTable.lastActivityAt,
          turnCount: threadTable.turnCount,
        })
        .from(threadTable)
        .where(eq(threadTable.id, thread.id))
        .get(),
    ).toEqual({ lastActivityAt: firstReply.message.createdAt, turnCount: 2 });
    expect(
      database
        .select({
          id: threadMessageTable.id,
          activeChildMessageId: threadMessageTable.activeChildMessageId,
        })
        .from(threadMessageTable)
        .all(),
    ).toEqual(
      expect.arrayContaining([
        { id: first.message.id, activeChildMessageId: firstReply.message.id },
        { id: firstReply.message.id, activeChildMessageId: second.message.id },
        { id: second.message.id, activeChildMessageId: null },
        { id: siblingReply.message.id, activeChildMessageId: null },
      ]),
    );
    expect(threads.getTurnContext(second.turn.id)).toEqual({
      turnId: second.turn.id,
      threadId: thread.id,
      inputMessageId: second.message.id,
      messages: [first.message, firstReply.message, second.message],
    });
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [first.message, firstReply.message, second.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 48,
    });
    expect(() =>
      threads.listMessages({
        threadId: thread.id,
        direction: "newer",
        cursor: siblingReply.message.id,
      }),
    ).toThrow(TypeError);
  });

  it("pages backward through one branch with an opaque message cursor", () => {
    const { threads } = openThreads(createDatabasePath(), () => 400);
    const thread = threads.create();
    const turns = Array.from({ length: THREAD_MESSAGE_PAGE_MAX_COUNT + 2 }, (_, index) =>
      threads.startTurn(thread.id, `Message ${index + 1}`),
    );

    const newestPage = threads.listMessages({ threadId: thread.id, direction: "older" });

    expect(newestPage.messages).toHaveLength(THREAD_MESSAGE_PAGE_MAX_COUNT);
    expect(newestPage.messages[0]?.sequence).toBe(3);
    expect(newestPage.messages.at(-1)?.sequence).toBe(THREAD_MESSAGE_PAGE_MAX_COUNT + 2);
    expect(newestPage.olderCursor).toBe(turns[1]?.message.id);

    if (!newestPage.olderCursor) {
      throw new Error("Expected another page of thread messages.");
    }

    expect(
      threads.listMessages({
        threadId: thread.id,
        direction: "older",
        cursor: newestPage.olderCursor,
      }),
    ).toEqual({
      messages: [turns[0]?.message, turns[1]?.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 18,
      newerCursor: turns[2]?.message.id,
    });
  });

  it("pages forward through the active branch without scanning from the thread head", () => {
    const { threads } = openThreads(createDatabasePath(), () => 425);
    const thread = threads.create();
    const turns = Array.from({ length: THREAD_MESSAGE_PAGE_MAX_COUNT + 2 }, (_, index) =>
      threads.startTurn(thread.id, `Message ${index + 1}`),
    );
    const newestPage = threads.listMessages({ threadId: thread.id, direction: "older" });
    const olderCursor = newestPage.olderCursor;

    if (!olderCursor) {
      throw new Error("Expected another page of thread messages.");
    }

    const oldestPage = threads.listMessages({
      threadId: thread.id,
      direction: "older",
      cursor: olderCursor,
    });

    expect(oldestPage.messages).toEqual([turns[0]?.message, turns[1]?.message]);
    expect(oldestPage.newerCursor).toBe(turns[2]?.message.id);

    if (!oldestPage.newerCursor) {
      throw new Error("Expected a forward cursor from the historical page.");
    }

    expect(
      threads.listMessages({
        threadId: thread.id,
        direction: "newer",
        cursor: oldestPage.newerCursor,
      }),
    ).toEqual(newestPage);
  });

  it("bounds a page by UTF-8 content bytes without splitting its anchor", () => {
    const { threads } = openThreads(createDatabasePath(), () => 450);
    const thread = threads.create();
    const excluded = threads.startTurn(thread.id, "Older message");
    const multibyte = threads.startTurn(thread.id, "é".repeat(32_768));
    const newest = threads.startTurn(thread.id, "x".repeat(65_536));

    const newestPage = threads.listMessages({ threadId: thread.id, direction: "older" });

    expect(newestPage).toEqual({
      messages: [multibyte.message, newest.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      olderCursor: excluded.message.id,
    });

    if (!newestPage.olderCursor) {
      throw new Error("Expected another page of thread messages.");
    }

    expect(
      threads.listMessages({
        threadId: thread.id,
        direction: "older",
        cursor: newestPage.olderCursor,
      }),
    ).toEqual({
      messages: [excluded.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 13,
      newerCursor: multibyte.message.id,
    });
    expect(
      threads.listMessages({
        threadId: thread.id,
        direction: "newer",
        cursor: multibyte.message.id,
      }),
    ).toEqual(newestPage);
  });

  it("returns an oversized anchor alone and reports its actual UTF-8 weight", () => {
    const { threads } = openThreads(createDatabasePath(), () => 475);
    const thread = threads.create();
    const parent = threads.startTurn(thread.id, "Parent message");
    const oversized = threads.startTurn(thread.id, "😀".repeat(50_000));

    expect(oversized.message.content).toHaveLength(THREAD_MESSAGE_MAX_CODE_UNITS);
    const latestPage = threads.listMessages({ threadId: thread.id, direction: "older" });

    expect(latestPage).toEqual({
      messages: [oversized.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 200_000,
      olderCursor: parent.message.id,
    });
    expect(
      threads.listMessages({
        threadId: thread.id,
        direction: "newer",
        cursor: oversized.message.id,
      }),
    ).toEqual(latestPage);
  });

  it("persists turns, messages, ancestry, and the active head when reopened", () => {
    const path = createDatabasePath();
    const firstConnection = openThreads(path, () => 500);
    const thread = firstConnection.threads.create();
    const started = firstConnection.threads.startTurn(thread.id, "Persistent message");

    closeDatabase(firstConnection.database);

    const secondConnection = openThreads(path);
    expect(secondConnection.threads.get(thread.id)).toEqual(thread);
    expect(secondConnection.threads.getTurnContext(started.turn.id)).toEqual({
      turnId: started.turn.id,
      threadId: thread.id,
      inputMessageId: started.message.id,
      messages: [started.message],
    });
    expect(
      secondConnection.threads.listMessages({ threadId: thread.id, direction: "older" }),
    ).toEqual({
      messages: [started.message],
      messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
      messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
      contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
      contentBytes: 18,
    });
  });

  it("rolls back the complete turn when storing its user message fails", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 600);
    const thread = threads.create();

    database.$client.exec(`
      CREATE TRIGGER reject_thread_message
      BEFORE INSERT ON thread_messages
      WHEN NEW.content = 'Rejected message'
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END;
    `);

    try {
      expect(() => threads.startTurn(thread.id, "Rejected message")).toThrow();
    } finally {
      database.$client.exec("DROP TRIGGER reject_thread_message;");
    }

    expect(database.select().from(turnTable).all()).toEqual([]);
    expect(threads.startTurn(thread.id, "Accepted message").message.sequence).toBe(1);
  });

  it("moves the active head and selected path edge atomically", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 650);
    const thread = threads.create();
    const root = threads.startTurn(thread.id, "Root message");

    database.$client.exec(`
      CREATE TRIGGER reject_active_path
      BEFORE UPDATE OF active_child_message_id ON thread_messages
      WHEN NEW.active_child_message_id IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END;
    `);

    try {
      expect(() => threads.startTurn(thread.id, "Rejected child")).toThrow();
    } finally {
      database.$client.exec("DROP TRIGGER reject_active_path;");
    }

    expect(threads.listMessages({ threadId: thread.id, direction: "older" }).messages).toEqual([
      root.message,
    ]);
    expect(threads.startTurn(thread.id, "Accepted child").message.sequence).toBe(2);
  });

  it("deletes an active user turn and every descendant branch without using sequence order", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 675);
    const thread = threads.create();
    const root = threads.startTurn(thread.id, "Root message");
    const rootReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: root.turn.id,
        parentMessageId: root.message.id,
        activateIfMessageId: root.message.id,
        content: "Root reply",
        createdAt: 676,
      }),
    );
    const target = threads.startTurn(thread.id, "Delete from here");
    const targetReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: target.turn.id,
        parentMessageId: target.message.id,
        activateIfMessageId: target.message.id,
        content: "Target reply",
        createdAt: 677,
      }),
    );
    const descendant = threads.startTurn(thread.id, "Descendant message");
    const inactiveTargetReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: target.turn.id,
        parentMessageId: target.message.id,
        activateIfMessageId: ids.message.create(),
        content: "Inactive target reply",
        createdAt: 678,
      }),
    );
    const retainedLaterMessage = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: root.turn.id,
        parentMessageId: root.message.id,
        activateIfMessageId: ids.message.create(),
        content: "Retained later message",
        createdAt: 679,
      }),
    );

    expect(rootReply.activated).toBe(true);
    expect(targetReply.activated).toBe(true);
    expect(inactiveTargetReply.activated).toBe(false);
    expect(retainedLaterMessage.activated).toBe(false);
    expect(threads.deleteFrom({ threadId: thread.id, userMessageId: target.message.id })).toEqual({
      threadId: thread.id,
      userMessageId: target.message.id,
      activeMessageId: rootReply.message.id,
      deletedTurnCount: 2,
      threadActivity: {
        threadId: thread.id,
        lastActivityAt: rootReply.message.createdAt,
        turnCount: 1,
      },
    });

    expect(threads.listMessages({ threadId: thread.id, direction: "older" }).messages).toEqual([
      root.message,
      rootReply.message,
    ]);
    expect(
      database
        .select({ id: threadMessageTable.id })
        .from(threadMessageTable)
        .all()
        .map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([
        root.message.id,
        rootReply.message.id,
        retainedLaterMessage.message.id,
      ]),
    );
    expect(database.select().from(threadMessageTable).all()).toHaveLength(3);
    expect(database.select().from(turnTable).all()).toEqual([root.turn]);

    const replacement = threads.startTurn(thread.id, "Replacement message");
    expect(replacement.message).toEqual(
      expect.objectContaining({ parentMessageId: rootReply.message.id, sequence: 8 }),
    );
    expect(descendant.message.sequence).toBe(5);
  });

  it("deletes a root user turn while retaining the thread and its sequence high-water mark", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 680);
    const thread = threads.create();
    const root = threads.startTurn(thread.id, "Delete the whole history");

    expect(threads.deleteFrom({ threadId: thread.id, userMessageId: root.message.id })).toEqual({
      threadId: thread.id,
      userMessageId: root.message.id,
      activeMessageId: null,
      deletedTurnCount: 1,
      threadActivity: {
        threadId: thread.id,
        lastActivityAt: thread.createdAt,
        turnCount: 0,
      },
    });
    expect(threads.get(thread.id)).toEqual(thread);
    expect(threads.listMessages({ threadId: thread.id, direction: "older" }).messages).toEqual([]);
    expect(database.select().from(turnTable).all()).toEqual([]);

    const replacement = threads.startTurn(thread.id, "New root");
    expect(replacement.message).toEqual(
      expect.objectContaining({ parentMessageId: null, sequence: 2 }),
    );
  });

  it("only deletes user messages on the active path of their owning thread", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 685);
    const thread = threads.create();
    const otherThread = threads.create();
    const root = threads.startTurn(thread.id, "Root message");
    const inactiveUser = threads.startTurn(thread.id, "Inactive user branch");
    const activeReply = database.transaction((transaction) =>
      appendAssistantMessageInTransaction(transaction, {
        threadId: thread.id,
        turnId: root.turn.id,
        parentMessageId: root.message.id,
        activateIfMessageId: inactiveUser.message.id,
        content: "Selected sibling reply",
        createdAt: 686,
      }),
    );
    const otherMessage = threads.startTurn(otherThread.id, "Other thread message").message;

    expect(activeReply.activated).toBe(true);
    expect(() =>
      threads.deleteFrom({ threadId: thread.id, userMessageId: activeReply.message.id }),
    ).toThrow(TypeError);
    expect(() =>
      threads.deleteFrom({ threadId: thread.id, userMessageId: inactiveUser.message.id }),
    ).toThrow(`User message "${inactiveUser.message.id}" is not on the active thread path.`);
    expect(() =>
      threads.deleteFrom({ threadId: thread.id, userMessageId: otherMessage.id }),
    ).toThrow(`Message "${otherMessage.id}" does not exist in thread "${thread.id}".`);
    expect(() =>
      threads.deleteFrom({ threadId: thread.id, userMessageId: ids.message.create() }),
    ).toThrow(RangeError);
    expect(threads.listMessages({ threadId: thread.id, direction: "older" }).messages).toEqual([
      root.message,
      activeReply.message,
    ]);
  });

  it("rolls back path changes when deleting the turn subtree fails", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 690);
    const thread = threads.create();
    const root = threads.startTurn(thread.id, "Root message");
    const target = threads.startTurn(thread.id, "Target message");

    database.$client.exec(`
      CREATE TRIGGER reject_turn_deletion
      BEFORE DELETE ON turns
      WHEN OLD.id = '${target.turn.id}'
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END;
    `);

    try {
      expect(() =>
        threads.deleteFrom({ threadId: thread.id, userMessageId: target.message.id }),
      ).toThrow();
    } finally {
      database.$client.exec("DROP TRIGGER reject_turn_deletion;");
    }

    expect(threads.listMessages({ threadId: thread.id, direction: "older" }).messages).toEqual([
      root.message,
      target.message,
    ]);
    expect(
      database
        .select({ activeMessageId: threadTable.activeMessageId })
        .from(threadTable)
        .where(eq(threadTable.id, thread.id))
        .get(),
    ).toEqual({ activeMessageId: target.message.id });
    expect(
      database
        .select({ activeChildMessageId: threadMessageTable.activeChildMessageId })
        .from(threadMessageTable)
        .where(eq(threadMessageTable.id, root.message.id))
        .get(),
    ).toEqual({ activeChildMessageId: target.message.id });
  });

  it("enforces turn ownership and message graph invariants in storage", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 700);
    const thread = threads.create();
    const otherThread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    expect(() =>
      database
        .insert(threadMessageTable)
        .values({
          id: ids.message.create(),
          threadId: thread.id,
          turnId: started.turn.id,
          parentMessageId: started.message.id,
          sequence: 2,
          author: "user",
          content: "Duplicate user input",
          createdAt: 701,
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(threadMessageTable)
        .values({
          id: ids.message.create(),
          threadId: otherThread.id,
          turnId: started.turn.id,
          parentMessageId: null,
          sequence: 1,
          author: "user",
          content: "Wrong thread",
          createdAt: 701,
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(threadMessageTable)
        .values({
          id: ids.message.create(),
          threadId: thread.id,
          turnId: started.turn.id,
          parentMessageId: null,
          sequence: 2,
          author: "assistant",
          content: "Missing parent",
          createdAt: 701,
        })
        .run(),
    ).toThrow();
    const otherMessage = threads.startTurn(otherThread.id, "Other thread").message;
    expect(() =>
      database.$client
        .prepare("UPDATE threads SET active_message_id = ? WHERE id = ?")
        .run(otherMessage.id, thread.id),
    ).toThrow();
    const child = threads.startTurn(thread.id, "Child");
    const grandchild = threads.startTurn(thread.id, "Grandchild");
    expect(() =>
      database.$client
        .prepare(
          "UPDATE thread_messages SET active_child_message_id = ? WHERE thread_id = ? AND id = ?",
        )
        .run(grandchild.message.id, thread.id, started.message.id),
    ).toThrow();
    expect(
      database
        .select({ activeChildMessageId: threadMessageTable.activeChildMessageId })
        .from(threadMessageTable)
        .where(eq(threadMessageTable.id, started.message.id))
        .get(),
    ).toEqual({ activeChildMessageId: child.message.id });
  });

  it("requires identities for every persisted turn and message", () => {
    const { database, threads } = openThreads(createDatabasePath());
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    expect(() =>
      database.$client
        .prepare("INSERT INTO turns (id, thread_id, created_at) VALUES (?, ?, ?)")
        .run(null, thread.id, 800),
    ).toThrow();
    expect(() =>
      database.$client
        .prepare(
          "INSERT INTO thread_messages (id, thread_id, turn_id, parent_message_id, sequence, author, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(null, thread.id, started.turn.id, started.message.id, 2, "assistant", "Reply", 800),
    ).toThrow();
  });

  it("rejects invalid content and missing threads or turns", () => {
    const { threads } = openThreads(createDatabasePath());
    const thread = threads.create();
    const missingThreadId = ids.thread.create();
    const missingTurnId = ids.turn.create();

    expect(() => threads.startTurn(thread.id, " \n\t ")).toThrow(TypeError);
    expect(() =>
      threads.startTurn(thread.id, "x".repeat(THREAD_MESSAGE_MAX_CODE_UNITS + 1)),
    ).toThrow(RangeError);
    expect(() => threads.startTurn(missingThreadId, "Hello")).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
    expect(() => threads.getTurnContext(missingTurnId)).toThrow(
      `Turn "${missingTurnId}" does not exist.`,
    );
  });

  it("rejects malformed, missing, and cross-thread message cursors", () => {
    const { threads } = openThreads(createDatabasePath());
    const thread = threads.create();
    const otherThread = threads.create();
    const otherMessage = threads.startTurn(otherThread.id, "Other thread").message;
    const missingThreadId = ids.thread.create();

    expect(() => threads.listMessages({ threadId: thread.id, direction: "newer" })).toThrow(
      TypeError,
    );

    expect(() =>
      threads.listMessages({ threadId: thread.id, direction: "older", cursor: "not-a-cursor" }),
    ).toThrow(TypeError);
    expect(() =>
      threads.listMessages({
        threadId: thread.id,
        direction: "older",
        cursor: ids.message.create(),
      }),
    ).toThrow(TypeError);
    expect(() =>
      threads.listMessages({
        threadId: thread.id,
        direction: "older",
        cursor: otherMessage.id,
      }),
    ).toThrow(TypeError);
    expect(() => threads.listMessages({ threadId: missingThreadId, direction: "older" })).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
  });
});
