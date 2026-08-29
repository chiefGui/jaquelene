import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "@/database";
import { ids } from "@/id";
import { threadMessageTable, turnTable } from "./schema";
import {
  appendAssistantMessageInTransaction,
  createThreads,
  THREAD_MESSAGE_CONTENT_MAX_LENGTH,
  THREAD_MESSAGE_PAGE_SIZE,
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
  it("creates a campaign-agnostic thread and retrieves it by identity", () => {
    const { threads } = openThreads(createDatabasePath(), () => 100);
    const thread = threads.create();

    expect(thread).toEqual({ id: expect.stringMatching(/^thread_/), createdAt: 100 });
    expect(threads.get(thread.id)).toEqual(thread);
    expect(threads.get(ids.thread.create())).toBeNull();
  });

  it("starts durable turns and links each user message to the active head", () => {
    let timestamp = 200;
    const { threads } = openThreads(createDatabasePath(), () => timestamp++);
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
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first.message, second.message],
    });
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
    expect(threads.getTurnContext(second.turn.id)).toEqual({
      turnId: second.turn.id,
      threadId: thread.id,
      inputMessageId: second.message.id,
      messages: [first.message, firstReply.message, second.message],
    });
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first.message, firstReply.message, second.message],
    });
  });

  it("pages backward through one branch with an opaque message cursor", () => {
    const { threads } = openThreads(createDatabasePath(), () => 400);
    const thread = threads.create();
    const turns = Array.from({ length: THREAD_MESSAGE_PAGE_SIZE + 2 }, (_, index) =>
      threads.startTurn(thread.id, `Message ${index + 1}`),
    );

    const newestPage = threads.listMessages({ threadId: thread.id });

    expect(newestPage.messages).toHaveLength(THREAD_MESSAGE_PAGE_SIZE);
    expect(newestPage.messages[0]?.sequence).toBe(3);
    expect(newestPage.messages.at(-1)?.sequence).toBe(THREAD_MESSAGE_PAGE_SIZE + 2);
    expect(newestPage.nextCursor).toBe(turns[1]?.message.id);

    if (!newestPage.nextCursor) {
      throw new Error("Expected another page of thread messages.");
    }

    expect(threads.listMessages({ threadId: thread.id, before: newestPage.nextCursor })).toEqual({
      messages: [turns[0]?.message, turns[1]?.message],
    });
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
    expect(secondConnection.threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message],
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
      threads.startTurn(thread.id, "x".repeat(THREAD_MESSAGE_CONTENT_MAX_LENGTH + 1)),
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

    expect(() => threads.listMessages({ threadId: thread.id, before: "not-a-cursor" })).toThrow(
      TypeError,
    );
    expect(() =>
      threads.listMessages({ threadId: thread.id, before: ids.message.create() }),
    ).toThrow(TypeError);
    expect(() => threads.listMessages({ threadId: thread.id, before: otherMessage.id })).toThrow(
      TypeError,
    );
    expect(() => threads.listMessages({ threadId: missingThreadId })).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
  });
});
