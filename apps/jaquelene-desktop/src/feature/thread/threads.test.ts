import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "@/database";
import { ids } from "@/id";
import {
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

  it("appends human messages in a stable per-thread order without changing their content", () => {
    let timestamp = 200;
    const { threads } = openThreads(createDatabasePath(), () => timestamp++);
    const thread = threads.create();
    const otherThread = threads.create();
    const first = threads.appendUserMessage(thread.id, "  First message  ");
    const second = threads.appendUserMessage(thread.id, "Second message");
    threads.appendUserMessage(otherThread.id, "Other thread message");

    expect(first).toEqual({
      id: expect.stringMatching(/^message_/),
      threadId: thread.id,
      sequence: 1,
      author: "user",
      content: "  First message  ",
      createdAt: 202,
    });
    expect(second.sequence).toBe(2);
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first, second],
    });
  });

  it("uses a bounded keyset cursor to page backward through messages", () => {
    const { threads } = openThreads(createDatabasePath(), () => 300);
    const thread = threads.create();

    for (let sequence = 1; sequence <= THREAD_MESSAGE_PAGE_SIZE + 2; sequence++) {
      threads.appendUserMessage(thread.id, `Message ${sequence}`);
    }

    const newestPage = threads.listMessages({ threadId: thread.id });

    expect(newestPage.messages).toHaveLength(THREAD_MESSAGE_PAGE_SIZE);
    expect(newestPage.messages[0]?.sequence).toBe(3);
    expect(newestPage.messages.at(-1)?.sequence).toBe(THREAD_MESSAGE_PAGE_SIZE + 2);
    expect(newestPage.nextCursor).toBe("3");

    if (!newestPage.nextCursor) {
      throw new Error("Expected another page of thread messages.");
    }

    const oldestPage = threads.listMessages({
      threadId: thread.id,
      before: newestPage.nextCursor,
    });

    expect(oldestPage).toEqual({
      messages: [
        expect.objectContaining({ sequence: 1, content: "Message 1" }),
        expect.objectContaining({ sequence: 2, content: "Message 2" }),
      ],
    });
  });

  it("persists threads and messages when the database is reopened", () => {
    const path = createDatabasePath();
    const firstConnection = openThreads(path, () => 400);
    const thread = firstConnection.threads.create();
    const message = firstConnection.threads.appendUserMessage(thread.id, "Persistent message");

    closeDatabase(firstConnection.database);

    const secondConnection = openThreads(path);
    expect(secondConnection.threads.get(thread.id)).toEqual(thread);
    expect(secondConnection.threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [message],
    });
  });

  it("rolls back sequence allocation when storing a message fails", () => {
    const { database, threads } = openThreads(createDatabasePath(), () => 450);
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
      expect(() => threads.appendUserMessage(thread.id, "Rejected message")).toThrow();
    } finally {
      database.$client.exec("DROP TRIGGER reject_thread_message;");
    }

    expect(threads.appendUserMessage(thread.id, "Accepted message").sequence).toBe(1);
  });

  it("requires every stored thread and message to have an identity", () => {
    const { database, threads } = openThreads(createDatabasePath());
    const thread = threads.create();

    expect(() =>
      database.$client
        .prepare("INSERT INTO threads (id, created_at, last_message_sequence) VALUES (?, ?, ?)")
        .run(null, 500, 0),
    ).toThrow();
    expect(() =>
      database.$client
        .prepare(
          "INSERT INTO thread_messages (id, thread_id, sequence, author, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(null, thread.id, 1, "user", "Missing identity", 500),
    ).toThrow();
  });

  it("rejects empty, oversized, and missing-thread messages", () => {
    const { threads } = openThreads(createDatabasePath());
    const thread = threads.create();
    const missingThreadId = ids.thread.create();

    expect(() => threads.appendUserMessage(thread.id, " \n\t ")).toThrow(TypeError);
    expect(() =>
      threads.appendUserMessage(thread.id, "x".repeat(THREAD_MESSAGE_CONTENT_MAX_LENGTH + 1)),
    ).toThrow(RangeError);
    expect(() => threads.appendUserMessage(missingThreadId, "Hello")).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
  });

  it("rejects invalid cursors and listing messages for an unknown thread", () => {
    const { threads } = openThreads(createDatabasePath());
    const thread = threads.create();
    const missingThreadId = ids.thread.create();

    expect(() => threads.listMessages({ threadId: thread.id, before: "0" })).toThrow(TypeError);
    expect(() => threads.listMessages({ threadId: thread.id, before: "01" })).toThrow(TypeError);
    expect(() => threads.listMessages({ threadId: thread.id, before: "not-a-cursor" })).toThrow(
      TypeError,
    );
    expect(() => threads.listMessages({ threadId: missingThreadId })).toThrow(
      `Thread "${missingThreadId}" does not exist.`,
    );
  });
});
