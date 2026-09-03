import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createGenerations } from "#backend/generation/generations";
import { createReplyPreparer } from "#backend/generation/reply-preparation";
import { generationTable } from "#backend/generation/schema";
import { superviseGenerations } from "#backend/generation/supervisor";
import { ids } from "#backend/id";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import { narratorPromptModule } from "#backend/narrator/module";
import { createPromptSubsystem } from "#backend/prompt/subsystem";
import { threadTable } from "#backend/thread/schema";
import {
  createThreads,
  THREAD_MESSAGE_MAX_CODE_UNITS,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "#backend/thread/threads";
import { providerAttemptTable } from "#backend/usage/schema";
import { createTurns } from "./turns";

const directories: string[] = [];
const databases: Database[] = [];
const closeSupervisors: Array<() => Promise<void>> = [];

function threadPageMetadata(messages: readonly { content: string }[]) {
  return {
    messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
    messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
    contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
    contentBytes: messages.reduce((total, { content }) => total + Buffer.byteLength(content), 0),
  };
}

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
  const { applications: promptApplications } = createPromptSubsystem(database, [
    narratorPromptModule,
  ]);
  const campaigns = createCampaigns(database, now);
  const threads = createThreads(database, now);
  const generationEngine = createGenerations(
    database,
    createReplyPreparer(threads, campaigns, promptApplications),
    {
      async getModel(reference) {
        if (reference.providerId !== "provider-a") {
          throw new RangeError(`Unknown test model provider "${reference.providerId}".`);
        }

        return { id: reference.modelId, name: "Test model", brandId: "test" };
      },
    },
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
  const turns = createTurns(database, threads, {
    acceptRegenerationInTransaction: generationEngine.acceptRegenerationInTransaction,
    acceptReplyInTransaction: generationEngine.acceptReplyInTransaction,
    listLatestForTurns: generationEngine.listLatestForTurns,
    resolveConfiguration: generationEngine.resolveConfiguration,
    scheduleAcceptedReply: supervised.scheduleAcceptedReply,
  });
  databases.push(database);
  closeSupervisors.push(supervised.close);
  return { database, generationEngine, threads, turns };
}

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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

    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    const pendingSubmission = turns.submit({
      threadId: thread.id,
      content: "Begin the voyage.",
      configuration: {
        model: { providerId: "provider-a", modelId: "maker/model" },
      },
    });
    expect(turns.inspect(thread.id)).toEqual({ state: "submitting" });

    const operation = await pendingSubmission;

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
        intent: "reply",
        status: "pending",
        providerId: "provider-a",
        modelId: "maker/model",
      }),
      threadActivity: {
        threadId: thread.id,
        lastActivityAt: operation.acceptance.userMessage.createdAt,
        turnCount: 1,
      },
    });
    expect(operation.acceptance.generation).not.toHaveProperty("reasoning");
    expect(turns.inspect(thread.id)).toEqual({
      state: "generating",
      intent: "reply",
      turnId: operation.acceptance.userMessage.turnId,
      generationId: operation.acceptance.generation.id,
    });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [operation.acceptance.userMessage],
      generations: [operation.acceptance.generation],
      ...threadPageMetadata([operation.acceptance.userMessage]),
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
      threadActivity: {
        threadId: thread.id,
        lastActivityAt: settlement.assistantMessage.createdAt,
        turnCount: 1,
      },
    });
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [operation.acceptance.userMessage, settlement.assistantMessage],
      generations: [settlement.generation],
      ...threadPageMetadata([operation.acceptance.userMessage, settlement.assistantMessage]),
    });
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
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const failedOperation = await turns.submit({
      threadId: thread.id,
      content: "Hello",
      configuration,
    });
    const failed = await failedOperation.settlement;

    if (failed.outcome !== "failed") {
      throw new Error("Expected reply generation to fail.");
    }

    expect(failed.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "provider" }),
    );
    expect(failed.failure).toEqual({ cause: providerFailure });
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });

    const pendingRetry = turns.retry({
      turnId: failed.userMessage.turnId,
      configuration,
    });
    expect(turns.inspect(thread.id)).toEqual({
      state: "retrying",
      turnId: failed.userMessage.turnId,
    });

    const retriedOperation = await pendingRetry;

    expect(retriedOperation.acceptance.userMessage).toEqual(failed.userMessage);
    expect(retriedOperation.acceptance.generation).toEqual(
      expect.objectContaining({ intent: "retry", status: "pending" }),
    );
    expect(retriedOperation.acceptance.generation.id).not.toBe(failed.generation.id);
    expect(turns.inspect(thread.id)).toEqual({
      state: "generating",
      intent: "retry",
      turnId: retriedOperation.acceptance.userMessage.turnId,
      generationId: retriedOperation.acceptance.generation.id,
    });

    const retried = await retriedOperation.settlement;

    if (retried.outcome !== "completed") {
      throw new Error("Expected retried reply generation to complete.");
    }

    expect(retried.generation).toEqual(expect.objectContaining({ status: "completed" }));
    expect(retried.assistantMessage).toEqual(
      expect.objectContaining({ author: "assistant", content: "Recovered reply" }),
    );
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
  });

  it("regenerates the active assistant reply while retaining it until settlement", async () => {
    const regeneratedReply = deferred<ProviderGenerationResult>();
    const generate = vi
      .fn<TestGenerate>()
      .mockResolvedValueOnce({ text: "Original reply" })
      .mockImplementationOnce(() => regeneratedReply.promise);
    let timestamp = 300;
    const { database, threads, turns } = openTurnEnvironment(generate, () => timestamp++);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const submission = await turns.submit({
      threadId: thread.id,
      content: "Hello",
      configuration,
    });
    const original = await submission.settlement;

    if (original.outcome !== "completed") {
      throw new Error("Expected the original reply to complete.");
    }

    const pendingRegeneration = turns.regenerate({
      assistantMessageId: original.assistantMessage.id,
      configuration,
    });
    expect(turns.inspect(thread.id)).toEqual({
      state: "regenerating",
      assistantMessageId: original.assistantMessage.id,
    });

    const regeneration = await pendingRegeneration;

    expect(regeneration.acceptance.userMessage).toEqual(submission.acceptance.userMessage);
    expect(regeneration.acceptance.generation).toEqual(
      expect.objectContaining({ intent: "regeneration", status: "pending" }),
    );
    expect(regeneration.acceptance.threadActivity).toEqual(original.threadActivity);
    expect(turns.inspect(thread.id)).toEqual({
      state: "generating",
      intent: "regeneration",
      turnId: submission.acceptance.userMessage.turnId,
      generationId: regeneration.acceptance.generation.id,
    });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [submission.acceptance.userMessage, original.assistantMessage],
      generations: [regeneration.acceptance.generation],
      ...threadPageMetadata([submission.acceptance.userMessage, original.assistantMessage]),
    });

    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    regeneratedReply.resolve({ text: "Regenerated reply" });
    const regenerated = await regeneration.settlement;

    if (regenerated.outcome !== "completed") {
      throw new Error("Expected regeneration to complete.");
    }

    expect(regenerated.assistantMessage).toEqual(
      expect.objectContaining({ author: "assistant", content: "Regenerated reply" }),
    );
    expect(regenerated.assistantActivated).toBe(true);
    expect(regenerated.threadActivity).toEqual({
      threadId: thread.id,
      lastActivityAt: regenerated.assistantMessage.createdAt,
      turnCount: original.threadActivity.turnCount,
    });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [submission.acceptance.userMessage, regenerated.assistantMessage],
      generations: [regenerated.generation],
      ...threadPageMetadata([submission.acceptance.userMessage, regenerated.assistantMessage]),
    });
    expect(database.select().from(generationTable).all()).toHaveLength(2);
    await expect(
      turns.regenerate({
        assistantMessageId: original.assistantMessage.id,
        configuration,
      }),
    ).rejects.toThrow(`Message "${original.assistantMessage.id}" is not the active thread reply.`);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps the active reply after failed regeneration and allows another attempt", async () => {
    const regenerationFailure = new Error("Provider unavailable");
    const results: Array<ProviderGenerationResult | Error> = [
      { text: "Original reply" },
      regenerationFailure,
      { text: "Recovered reply" },
    ];
    const generate = vi.fn<TestGenerate>(async () => {
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
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const submission = await turns.submit({ threadId: thread.id, content: "Hello", configuration });
    const original = await submission.settlement;

    if (original.outcome !== "completed") {
      throw new Error("Expected the original reply to complete.");
    }

    const failedAttempt = await turns.regenerate({
      assistantMessageId: original.assistantMessage.id,
      configuration,
    });
    const failed = await failedAttempt.settlement;

    expect(failed).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: { cause: regenerationFailure },
        threadActivity: original.threadActivity,
      }),
    );
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([
      submission.acceptance.userMessage,
      original.assistantMessage,
    ]);

    const retryAttempt = await turns.regenerate({
      assistantMessageId: original.assistantMessage.id,
      configuration,
    });
    const recovered = await retryAttempt.settlement;

    expect(recovered).toEqual(
      expect.objectContaining({
        outcome: "completed",
        assistantMessage: expect.objectContaining({ content: "Recovered reply" }),
      }),
    );
  });

  it("rejects regeneration when the selected response is not the active thread head", async () => {
    const generate = vi.fn<TestGenerate>(async ({ input }) => ({
      text: `Reply ${input.dialogue.length}`,
    }));
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const firstSubmission = await turns.submit({
      threadId: thread.id,
      content: "First",
      configuration,
    });
    const first = await firstSubmission.settlement;

    if (first.outcome !== "completed") {
      throw new Error("Expected the first reply to complete.");
    }

    const secondSubmission = await turns.submit({
      threadId: thread.id,
      content: "Second",
      configuration,
    });
    await secondSubmission.settlement;

    await expect(
      turns.regenerate({
        assistantMessageId: first.assistantMessage.id,
        configuration,
      }),
    ).rejects.toThrow(`Message "${first.assistantMessage.id}" is not the active thread reply.`);
    await expect(
      turns.regenerate({
        assistantMessageId: firstSubmission.acceptance.userMessage.id,
        configuration,
      }),
    ).rejects.toThrow(
      `Message "${firstSubmission.acceptance.userMessage.id}" is not an assistant message.`,
    );
    expect(generate).toHaveBeenCalledTimes(2);
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
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const first = await turns.submit({ threadId: thread.id, content: "First", configuration });

    expect(() =>
      turns.deleteFrom({
        threadId: thread.id,
        userMessageId: first.acceptance.userMessage.id,
      }),
    ).toThrow(`Thread "${thread.id}" already has an active turn operation.`);
    await expect(
      turns.submit({ threadId: thread.id, content: "Too soon", configuration }),
    ).rejects.toThrow(`Thread "${thread.id}" already has an active turn operation.`);
    const independent = await turns.submit({
      threadId: independentThread.id,
      content: "Independent",
      configuration,
    });
    await expect(independent.settlement).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );

    firstReply.resolve({ text: "First reply" });
    await first.settlement;
    const second = await turns.submit({ threadId: thread.id, content: "Second", configuration });
    await expect(second.settlement).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toHaveLength(
      4,
    );
  });

  it("deletes durable conversation state while retaining provider usage history", async () => {
    const generate = vi.fn(async () => ({ text: "Completed reply" }));
    const { database, threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const operation = await turns.submit({
      threadId: thread.id,
      content: "Delete this turn",
      configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
    });
    await operation.settlement;
    const attemptsBeforeDeletion = database.select().from(providerAttemptTable).all();

    expect(attemptsBeforeDeletion).toHaveLength(1);
    expect(
      turns.deleteFrom({
        threadId: thread.id,
        userMessageId: operation.acceptance.userMessage.id,
      }),
    ).toEqual({
      threadId: thread.id,
      userMessageId: operation.acceptance.userMessage.id,
      activeMessageId: null,
      deletedTurnCount: 1,
      threadActivity: {
        threadId: thread.id,
        lastActivityAt: thread.createdAt,
        turnCount: 0,
      },
    });
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [],
      generations: [],
      ...threadPageMetadata([]),
    });
    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(providerAttemptTable).all()).toEqual(attemptsBeforeDeletion);
  });

  it("rolls back a user turn when pending generation acceptance fails", async () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { database, generationEngine, threads } = openTurnEnvironment(generate);
    const thread = threads.create();
    const acceptanceFailure = new Error("Could not persist pending generation.");
    const turns = createTurns(database, threads, {
      acceptRegenerationInTransaction: generationEngine.acceptRegenerationInTransaction,
      acceptReplyInTransaction() {
        throw acceptanceFailure;
      },
      listLatestForTurns: generationEngine.listLatestForTurns,
      resolveConfiguration: generationEngine.resolveConfiguration,
      scheduleAcceptedReply() {
        throw new Error("Generation must not be scheduled after failed acceptance.");
      },
    });

    await expect(
      turns.submit({
        threadId: thread.id,
        content: "Do not retain this",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    ).rejects.toBe(acceptanceFailure);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [],
      generations: [],
      ...threadPageMetadata([]),
    });
    expect(
      database
        .select({
          lastActivityAt: threadTable.lastActivityAt,
          turnCount: threadTable.turnCount,
        })
        .from(threadTable)
        .get(),
    ).toEqual({ lastActivityAt: thread.createdAt, turnCount: 0 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("releases thread ownership when an accepted turn cannot settle", async () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { database, generationEngine, threads } = openTurnEnvironment(generate);
    const thread = threads.create();
    const settlementFailure = new Error("Could not schedule generation.");
    const settlement = deferred<never>();
    const turns = createTurns(database, threads, {
      acceptRegenerationInTransaction: generationEngine.acceptRegenerationInTransaction,
      acceptReplyInTransaction: generationEngine.acceptReplyInTransaction,
      listLatestForTurns: generationEngine.listLatestForTurns,
      resolveConfiguration: generationEngine.resolveConfiguration,
      scheduleAcceptedReply: () => settlement.promise,
    });
    const operation = await turns.submit({
      threadId: thread.id,
      content: "Hello",
      configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
    });

    expect(turns.inspect(thread.id)).toEqual({
      state: "generating",
      intent: "reply",
      turnId: operation.acceptance.userMessage.turnId,
      generationId: operation.acceptance.generation.id,
    });
    settlement.reject(settlementFailure);
    await expect(operation.settlement).rejects.toBe(settlementFailure);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects invalid work before accepting a turn", async () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { threads, turns } = openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const interruption = new Error("Cancelled before submission");
    const controller = new AbortController();
    controller.abort(interruption);

    await expect(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration,
        signal: controller.signal,
      }),
    ).rejects.toBe(interruption);
    await expect(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration: {
          model: { providerId: "missing-provider", modelId: "maker/model" },
        },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    await expect(
      turns.submit({ threadId: thread.id, content: "  ", configuration }),
    ).rejects.toThrow(TypeError);
    await expect(
      turns.submit({ threadId: ids.thread.create(), content: "Hello", configuration }),
    ).rejects.toThrow(RangeError);
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
