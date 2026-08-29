import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createGenerations } from "#backend/generation/generations";
import { createTurnPromptCompiler } from "#backend/generation/prompt";
import type { GenerationProvider, GenerationProviderResult } from "#backend/generation/provider";
import { ids } from "#backend/id";
import {
  createThreads,
  THREAD_MESSAGE_CONTENT_MAX_LENGTH,
  THREAD_MESSAGE_PAGE_SIZE,
} from "#backend/thread/threads";
import { createTurns } from "./turns";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-turns-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openTurnEnvironment(
  generate: GenerationProvider["generate"],
  now: () => number = Date.now,
) {
  const database = openDatabase(createDatabasePath());
  const threads = createThreads(database, now);
  const generationEngine = createGenerations(
    database,
    createTurnPromptCompiler(threads),
    [{ id: "provider-a", generate }],
    now,
  );
  const turns = createTurns(threads, generationEngine);
  databases.push(database);
  return { database, generationEngine, threads, turns };
}

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("turns", () => {
  it("submits one durable user turn and its generated reply", async () => {
    let timestamp = 100;
    const generate = vi.fn(async () => ({ text: "Welcome aboard." }));
    const { threads, turns } = openTurnEnvironment(generate, () => timestamp++);
    const thread = threads.create();

    const submission = await turns.submit({
      threadId: thread.id,
      content: "Begin the voyage.",
      model: { providerId: "provider-a", modelId: "maker/model" },
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.id,
        modelId: "maker/model",
        messages: [{ role: "user", content: "Begin the voyage." }],
      }),
    );
    expect(submission).toEqual({
      turn: {
        id: expect.stringMatching(/^turn_/),
        threadId: thread.id,
        createdAt: 101,
      },
      userMessage: expect.objectContaining({
        id: expect.stringMatching(/^message_/),
        threadId: thread.id,
        author: "user",
        content: "Begin the voyage.",
      }),
      generation: expect.objectContaining({
        id: expect.stringMatching(/^generation_/),
        status: "completed",
        providerId: "provider-a",
        modelId: "maker/model",
      }),
      assistantMessage: expect.objectContaining({
        id: expect.stringMatching(/^message_/),
        threadId: thread.id,
        author: "assistant",
        content: "Welcome aboard.",
      }),
      assistantActivated: true,
      failure: null,
    });
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [submission.userMessage, submission.assistantMessage],
      generations: [submission.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("returns durable generation failures and advances them through retry", async () => {
    const providerFailure = new Error("Provider unavailable");
    const results: Array<GenerationProviderResult | Error> = [
      providerFailure,
      { text: "Recovered reply" },
    ];
    const generate = vi.fn(async () => {
      const result = results.shift();

      if (result instanceof Error) {
        throw result;
      }

      if (!result) {
        throw new Error("Missing provider result.");
      }

      return result;
    });
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };

    const failed = await turns.submit({ threadId: thread.id, content: "Hello", model });

    expect(failed.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "provider" }),
    );
    expect(failed.assistantMessage).toBeNull();
    expect(failed.failure).toEqual({ cause: providerFailure });
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [failed.userMessage],
      generations: [failed.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });

    const retried = await turns.retry({ turnId: failed.turn.id, model });

    expect(retried.turn).toEqual(failed.turn);
    expect(retried.userMessage).toEqual(failed.userMessage);
    expect(retried.generation).toEqual(expect.objectContaining({ status: "completed" }));
    expect(retried.failure).toBeNull();
    expect(retried.generation.id).not.toBe(failed.generation.id);
    expect(retried.assistantMessage).toEqual(
      expect.objectContaining({ author: "assistant", content: "Recovered reply" }),
    );
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [failed.userMessage, retried.assistantMessage],
      generations: [retried.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("rejects overlapping operations within a thread without blocking other threads", async () => {
    const firstReply = deferred<GenerationProviderResult>();
    const generate = vi
      .fn<GenerationProvider["generate"]>()
      .mockImplementationOnce(() => firstReply.promise)
      .mockResolvedValue({ text: "Next reply" });
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const independentThread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };
    const first = turns.submit({ threadId: thread.id, content: "First", model });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await expect(turns.submit({ threadId: thread.id, content: "Too soon", model })).rejects.toThrow(
      `Thread "${thread.id}" already has an active turn operation.`,
    );
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [expect.objectContaining({ content: "First" })],
      generations: [expect.objectContaining({ status: "pending" })],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    await expect(
      turns.submit({ threadId: independentThread.id, content: "Independent", model }),
    ).resolves.toEqual(expect.objectContaining({ assistantActivated: true }));

    firstReply.resolve({ text: "First reply" });
    await first;
    await expect(turns.submit({ threadId: thread.id, content: "Second", model })).resolves.toEqual(
      expect.objectContaining({ assistantActivated: true }),
    );
    expect(turns.listForThread({ threadId: thread.id }).messages).toHaveLength(4);
  });

  it("rejects invalid work before creating or retrying a turn", async () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };
    const interruption = new Error("Cancelled before submission");
    const controller = new AbortController();
    controller.abort(interruption);

    await expect(
      turns.submit({ threadId: thread.id, content: "Hello", model, signal: controller.signal }),
    ).rejects.toBe(interruption);
    await expect(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        model: { providerId: "missing-provider", modelId: "maker/model" },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    await expect(turns.submit({ threadId: thread.id, content: "  ", model })).rejects.toThrow(
      TypeError,
    );
    await expect(
      turns.submit({ threadId: ids.thread.create(), content: "Hello", model }),
    ).rejects.toThrow(RangeError);
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [],
      generations: [],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });

    const unattempted = threads.startTurn(thread.id, "Stored without generation");
    await expect(turns.retry({ turnId: unattempted.turn.id, model })).rejects.toThrow(
      `Turn "${unattempted.turn.id}" has no failed generation to retry.`,
    );
    await expect(turns.retry({ turnId: ids.turn.create(), model })).rejects.toThrow(
      "does not exist",
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
