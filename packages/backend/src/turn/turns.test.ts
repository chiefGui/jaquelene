import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createGenerations } from "#backend/generation/generations";
import { createTurnPromptCompiler } from "#backend/generation/prompt";
import { superviseGenerations } from "#backend/generation/supervisor";
import { ids, type ThreadId } from "#backend/id";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import {
  createThreads,
  THREAD_MESSAGE_CONTENT_MAX_LENGTH,
  THREAD_MESSAGE_PAGE_SIZE,
} from "#backend/thread/threads";
import { createTurns } from "./turns";

const directories: string[] = [];
const databases: Database[] = [];
const closeSupervisors: Array<() => Promise<void>> = [];

type TestGenerate = (
  request: ProviderGenerationRequest & { signal?: AbortSignal },
) => Promise<ProviderGenerationResult>;

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-turns-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openTurnEnvironment(generate: TestGenerate, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const acceptedThreadIds: ThreadId[] = [];
  const acceptedTurns = {
    recordInTransaction(_transaction: Pick<Database, "insert" | "select">, threadId: ThreadId) {
      acceptedThreadIds.push(threadId);
    },
  };
  const threads = createThreads(database, now);
  const generationEngine = createGenerations(
    database,
    createTurnPromptCompiler(threads),
    {
      get(providerId) {
        return providerId === "provider-a"
          ? {
              generate: (request, signal) =>
                generate({ ...request, ...(signal ? { signal } : {}) }),
            }
          : undefined;
      },
    },
    now,
  );
  const supervised = superviseGenerations(generationEngine);
  const turns = createTurns(
    database,
    threads,
    {
      acceptReplyInTransaction: generationEngine.acceptReplyInTransaction,
      listLatestForTurns: generationEngine.listLatestForTurns,
      requireRegisteredModel: generationEngine.requireRegisteredModel,
      scheduleAcceptedReply: supervised.scheduleAcceptedReply,
    },
    acceptedTurns,
  );
  databases.push(database);
  closeSupervisors.push(supervised.close);
  return { acceptedThreadIds, acceptedTurns, database, generationEngine, threads, turns };
}

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(async () => {
  for (const close of closeSupervisors.splice(0)) {
    await close();
  }

  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("turns", () => {
  it("accepts a durable user turn before provider work settles", async () => {
    const providerReply = deferred<ProviderGenerationResult>();
    const generate = vi.fn<TestGenerate>(() => providerReply.promise);
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();

    const operation = turns.submit({
      threadId: thread.id,
      content: "Begin the voyage.",
      model: { providerId: "provider-a", modelId: "maker/model" },
    });

    expect(generate).not.toHaveBeenCalled();
    expect(operation.acceptance).toEqual({
      userMessage: expect.objectContaining({
        id: expect.stringMatching(/^message_/),
        threadId: thread.id,
        author: "user",
        content: "Begin the voyage.",
      }),
      generation: expect.objectContaining({
        id: expect.stringMatching(/^generation_/),
        status: "pending",
        providerId: "provider-a",
        modelId: "maker/model",
      }),
    });
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [operation.acceptance.userMessage],
      generations: [operation.acceptance.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    providerReply.resolve({ text: "Welcome aboard." });
    const settlement = await operation.settlement;

    if (settlement.outcome !== "completed") {
      throw new Error("Expected reply generation to complete.");
    }

    expect(settlement).toEqual({
      ...operation.acceptance,
      outcome: "completed",
      generation: expect.objectContaining({ status: "completed" }),
      assistantMessage: expect.objectContaining({
        threadId: thread.id,
        author: "assistant",
        content: "Welcome aboard.",
      }),
      assistantActivated: true,
    });
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [operation.acceptance.userMessage, settlement.assistantMessage],
      generations: [settlement.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("projects each accepted user turn", async () => {
    const generate = vi.fn<TestGenerate>(async () => ({ text: "Reply" }));
    const { acceptedThreadIds, threads, turns } = openTurnEnvironment(generate);
    const firstThread = threads.create();
    const secondThread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };

    const first = turns.submit({
      threadId: firstThread.id,
      content: "First turn",
      model,
    });
    expect(acceptedThreadIds).toEqual([firstThread.id]);

    const second = turns.submit({
      threadId: secondThread.id,
      content: "Second turn",
      model,
    });
    expect(acceptedThreadIds).toEqual([firstThread.id, secondThread.id]);

    await Promise.all([first.settlement, second.settlement]);
  });

  it("settles durable generation failures and accepts their retry immediately", async () => {
    const providerFailure = new Error("Provider unavailable");
    const results: Array<ProviderGenerationResult | Error> = [
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
    const failedOperation = turns.submit({ threadId: thread.id, content: "Hello", model });
    const failed = await failedOperation.settlement;

    if (failed.outcome !== "failed") {
      throw new Error("Expected reply generation to fail.");
    }

    expect(failed.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "provider" }),
    );
    expect(failed.failure).toEqual({ cause: providerFailure });

    const retriedOperation = turns.retry({ turnId: failed.userMessage.turnId, model });

    expect(retriedOperation.acceptance.userMessage).toEqual(failed.userMessage);
    expect(retriedOperation.acceptance.generation).toEqual(
      expect.objectContaining({ status: "pending" }),
    );
    expect(retriedOperation.acceptance.generation.id).not.toBe(failed.generation.id);

    const retried = await retriedOperation.settlement;

    if (retried.outcome !== "completed") {
      throw new Error("Expected retried reply generation to complete.");
    }

    expect(retried.generation).toEqual(expect.objectContaining({ status: "completed" }));
    expect(retried.assistantMessage).toEqual(
      expect.objectContaining({ author: "assistant", content: "Recovered reply" }),
    );
  });

  it("holds thread exclusivity through settlement without blocking other threads", async () => {
    const firstReply = deferred<ProviderGenerationResult>();
    const generate = vi
      .fn<TestGenerate>()
      .mockImplementationOnce(() => firstReply.promise)
      .mockResolvedValue({ text: "Next reply" });
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const independentThread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };
    const first = turns.submit({ threadId: thread.id, content: "First", model });

    expect(() => turns.submit({ threadId: thread.id, content: "Too soon", model })).toThrow(
      `Thread "${thread.id}" already has an active turn operation.`,
    );
    const independent = turns.submit({
      threadId: independentThread.id,
      content: "Independent",
      model,
    });
    await expect(independent.settlement).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );

    firstReply.resolve({ text: "First reply" });
    await first.settlement;
    const second = turns.submit({ threadId: thread.id, content: "Second", model });
    await expect(second.settlement).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );
    expect(turns.listForThread({ threadId: thread.id }).messages).toHaveLength(4);
  });

  it("rolls back a user turn when pending generation acceptance fails", () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { acceptedThreadIds, acceptedTurns, database, generationEngine, threads } =
      openTurnEnvironment(generate);
    const thread = threads.create();
    const acceptanceFailure = new Error("Could not persist pending generation.");
    const turns = createTurns(
      database,
      threads,
      {
        acceptReplyInTransaction() {
          throw acceptanceFailure;
        },
        listLatestForTurns: generationEngine.listLatestForTurns,
        requireRegisteredModel: generationEngine.requireRegisteredModel,
        scheduleAcceptedReply() {
          throw new Error("Generation must not be scheduled after failed acceptance.");
        },
      },
      acceptedTurns,
    );

    expect(() =>
      turns.submit({
        threadId: thread.id,
        content: "Do not retain this",
        model: { providerId: "provider-a", modelId: "maker/model" },
      }),
    ).toThrow(acceptanceFailure);
    expect(turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [],
      generations: [],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    expect(acceptedThreadIds).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects invalid work before accepting a turn", () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const model = { providerId: "provider-a", modelId: "maker/model" };
    const interruption = new Error("Cancelled before submission");
    const controller = new AbortController();
    controller.abort(interruption);

    expect(() =>
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        model,
        signal: controller.signal,
      }),
    ).toThrow(interruption);
    expect(() =>
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        model: { providerId: "missing-provider", modelId: "maker/model" },
      }),
    ).toThrow('Unknown generation provider "missing-provider".');
    expect(() => turns.submit({ threadId: thread.id, content: "  ", model })).toThrow(TypeError);
    expect(() => turns.submit({ threadId: ids.thread.create(), content: "Hello", model })).toThrow(
      RangeError,
    );
    expect(turns.listForThread({ threadId: thread.id }).messages).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
