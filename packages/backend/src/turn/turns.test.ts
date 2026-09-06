import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import { createCampaigns } from "#backend/campaign/campaigns";
import { getCampaignUsageAttribution } from "#backend/campaign/usage";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createGenerations } from "#backend/generation/generations";
import { createReplyPreparer } from "#backend/generation/reply-preparation";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import {
  createModelExecutor,
  ModelProviderError,
  type ModelExecutor,
} from "#backend/model/execution";
import { createModelInputResolver } from "#backend/model/input-resolver";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import { ProviderOperationError } from "#backend/provider/providers";
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
import { createUsageHistory } from "#backend/usage/history";
import { createTurns } from "./turns";

const directories: string[] = [];
const databases: Database[] = [];
const scopes: Scope.Closeable[] = [];

function scoped<A, E>(effect: Effect.Effect<A, E, Scope.Scope>) {
  const scope = Scope.makeUnsafe();
  scopes.push(scope);
  return Effect.runPromise(effect.pipe(Scope.provide(scope)));
}

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

function modelExecutor(generate: TestGenerate): ModelExecutor {
  return createModelExecutor(
    {
      getModel: Effect.fnUntraced(function* (reference) {
        if (reference.providerId !== "provider-a") {
          return yield* Effect.fail(new RangeError(`Unknown provider "${reference.providerId}".`));
        }

        return { id: reference.modelId, name: "Test model", brandId: "test" };
      }),
    },
    {
      generate(providerId, request) {
        return Effect.tryPromise({
          try: (signal) => {
            if (providerId !== "provider-a") {
              throw new RangeError(`Unknown provider "${providerId}".`);
            }
            return generate({ ...request, signal });
          },
          catch: (cause) =>
            new ProviderOperationError({ providerId, operation: "generate", cause }),
        });
      },
    },
  );
}

async function openTurnEnvironment(generate: TestGenerate, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const { applications: promptApplications } = createPromptSubsystem(database, [
    narratorPromptModule,
  ]);
  const campaigns = createCampaigns(database, now);
  const threads = createThreads(database, now);
  const usage = createUsageHistory(database, vi.fn());
  const generationEngine = createGenerations({
    database,
    replyPreparer: createReplyPreparer(
      threads,
      createModelInputResolver(campaigns, promptApplications),
    ),
    modelExecutor: modelExecutor(generate),
    attempts: usage.attempts,
    getUsageAttribution: (threadId) => getCampaignUsageAttribution(database, threadId),
    now,
  });
  const scope = Scope.makeUnsafe();
  scopes.push(scope);
  const turns = await Effect.runPromise(
    createTurns(database, threads, generationEngine).pipe(Scope.provide(scope)),
  );
  databases.push(database);
  return { database, generationEngine, scope, threads, turns };
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
  for (const scope of scopes.splice(0)) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }

  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("turns", () => {
  it("owns configuration before it can initiate shutdown", async () => {
    const { database, generationEngine, scope, threads, turns } = await openTurnEnvironment(
      async () => ({ text: "Unused" }),
    );
    let closing: Promise<Exit.Exit<void>> | undefined;
    vi.spyOn(generationEngine, "resolveConfiguration").mockReturnValueOnce(
      Effect.suspend(() => {
        closing = Effect.runPromiseExit(Scope.close(scope, Exit.void));
        return Effect.never;
      }),
    );
    const thread = threads.create();

    const submitted = await Effect.runPromiseExit(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    );

    expect(Exit.isFailure(submitted)).toBe(true);
    if (!closing) {
      throw new Error("Configuration did not initiate shutdown.");
    }
    expect(Exit.isSuccess(await closing)).toBe(true);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("preserves configuration cleanup defects when the caller cancels admission", async () => {
    const { database, generationEngine, threads, turns } = await openTurnEnvironment(async () => ({
      text: "Unused",
    }));
    const entered = Deferred.makeUnsafe<void>();
    const cleanupFailure = new Error("Configuration cleanup failed.");
    vi.spyOn(generationEngine, "resolveConfiguration").mockReturnValueOnce(
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.die(cleanupFailure)),
      ),
    );
    const thread = threads.create();
    const submission = Effect.runFork(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    );
    await Effect.runPromise(Deferred.await(entered));

    await Effect.runPromise(Fiber.interrupt(submission));
    const exit = await Effect.runPromise(Fiber.await(submission));

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected interrupted admission.");
    }
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Cause.squash(exit.cause)).toBe(cleanupFailure);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("cancels active provider work and ignores its late Promise completion", async () => {
    const reply = deferred<ProviderGenerationResult>();
    const generate = vi.fn<TestGenerate>(() => reply.promise);
    const { database, threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const operation = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());

    await Effect.runPromise(operation.cancel);
    const settled = await Effect.runPromise(operation.settlement);

    expect(settled.generation).toMatchObject({ status: "failed", failureKind: "interrupted" });
    expect(generate.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(database.select().from(providerAttemptTable).get()).toMatchObject({
      status: "failed",
      failureKind: "interrupted",
    });
    reply.resolve({ text: "Too late" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([
      operation.acceptance.userMessage,
    ]);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
  });

  it("cancels immediately accepted work before preparation and permits retry", async () => {
    const generate = vi.fn(async () => ({ text: "Reply" }));
    const { database, threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = { model: { providerId: "provider-a", modelId: "maker/model" } };
    const operation = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Hello", configuration }),
    );

    await Effect.runPromise(operation.cancel);
    const settlement = await Effect.runPromise(operation.settlement);

    expect(settlement.generation).toMatchObject({ status: "failed", failureKind: "interrupted" });
    expect(generate).not.toHaveBeenCalled();
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    const retry = await Effect.runPromise(
      turns.retry({ turnId: operation.acceptance.userMessage.turnId, configuration }),
    );
    await expect(Effect.runPromise(retry.settlement)).resolves.toMatchObject({
      outcome: "completed",
    });
  });

  it("cancels configuration before acceptance without persisting a turn", async () => {
    const { database, generationEngine, threads, turns } = await openTurnEnvironment(async () => ({
      text: "Unused",
    }));
    const entered = Deferred.makeUnsafe<void>();
    vi.spyOn(generationEngine, "resolveConfiguration").mockReturnValueOnce(
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
    );
    const thread = threads.create();
    const configuration = { model: { providerId: "provider-a", modelId: "maker/model" } };
    const submission = Effect.runFork(
      turns.submit({ threadId: thread.id, content: "Hello", configuration }),
    );
    await Effect.runPromise(Deferred.await(entered));
    expect(turns.inspect(thread.id)).toEqual({ state: "submitting" });
    await expect(
      Effect.runPromise(turns.submit({ threadId: thread.id, content: "Competing", configuration })),
    ).rejects.toThrow("already has an active operation");

    await Effect.runPromise(Fiber.interrupt(submission));

    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([]);
    expect(database.select().from(generationTable).all()).toEqual([]);
    const next = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Next", configuration }),
    );
    await Effect.runPromise(next.settlement);
  });

  it("shutdown drains configuration and rejects retained service calls", async () => {
    const { database, generationEngine, scope, threads, turns } = await openTurnEnvironment(
      async () => ({ text: "Unused" }),
    );
    const entered = Deferred.makeUnsafe<void>();
    const released = vi.fn();
    vi.spyOn(generationEngine, "resolveConfiguration").mockReturnValueOnce(
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.sync(released)),
      ),
    );
    const thread = threads.create();
    const request = {
      threadId: thread.id,
      content: "Hello",
      configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
    };
    const submission = Effect.runPromiseExit(turns.submit(request));
    await Effect.runPromise(Deferred.await(entered));

    await Effect.runPromise(Scope.close(scope, Exit.void));

    expect(Exit.isFailure(await submission)).toBe(true);
    expect(released).toHaveBeenCalledOnce();
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(database.select().from(generationTable).all()).toEqual([]);
    await expect(Effect.runPromise(turns.submit(request))).rejects.toThrow("closed");
  });

  it("runs owned work with the service context instead of a transient caller context", async () => {
    const { database, generationEngine, threads } = await openTurnEnvironment(async () => ({
      text: "Unused",
    }));
    const Owner = Context.Reference<string>("turn-test/Owner", { defaultValue: () => "default" });
    const observed: string[] = [];
    const original = generationEngine.resolveConfiguration;
    vi.spyOn(generationEngine, "resolveConfiguration").mockImplementation((configuration) =>
      Effect.gen(function* () {
        observed.push(yield* Owner);
        return yield* original(configuration);
      }),
    );
    const turns = await scoped(
      createTurns(database, threads, generationEngine).pipe(
        Effect.provideService(Owner, "service"),
      ),
    );
    const thread = threads.create();
    const operation = await Effect.runPromise(
      turns
        .submit({
          threadId: thread.id,
          content: "Hello",
          configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
        })
        .pipe(Effect.provideService(Owner, "caller")),
    );
    await Effect.runPromise(operation.settlement);
    expect(observed).toEqual(["service"]);
  });

  it("accepts a durable user turn before provider work settles", async () => {
    const providerReply = deferred<ProviderGenerationResult>();
    const generate = vi.fn<TestGenerate>(() => providerReply.promise);
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();

    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    const pendingSubmission = Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Begin the voyage.",
        configuration: {
          model: { providerId: "provider-a", modelId: "maker/model" },
        },
      }),
    );
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
    const settlement = await Effect.runPromise(operation.settlement);

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
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const failedOperation = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration,
      }),
    );
    const failed = await Effect.runPromise(failedOperation.settlement);

    if (failed.outcome !== "failed") {
      throw new Error("Expected reply generation to fail.");
    }

    expect(failed.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "provider" }),
    );
    expect(failed.failure.cause).toBeInstanceOf(ModelProviderError);
    expect(failed.failure.cause).toEqual(
      expect.objectContaining({
        cause: expect.objectContaining({
          _tag: "ProviderOperationError",
          providerId: "provider-a",
          operation: "generate",
          cause: providerFailure,
        }),
        message: providerFailure.message,
      }),
    );
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });

    const pendingRetry = Effect.runPromise(
      turns.retry({
        turnId: failed.userMessage.turnId,
        configuration,
      }),
    );
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

    const retried = await Effect.runPromise(retriedOperation.settlement);

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
    const { database, threads, turns } = await openTurnEnvironment(generate, () => timestamp++);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const submission = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration,
      }),
    );
    const original = await Effect.runPromise(submission.settlement);

    if (original.outcome !== "completed") {
      throw new Error("Expected the original reply to complete.");
    }

    const pendingRegeneration = Effect.runPromise(
      turns.regenerate({
        assistantMessageId: original.assistantMessage.id,
        configuration,
      }),
    );
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
    const regenerated = await Effect.runPromise(regeneration.settlement);

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
      Effect.runPromise(
        turns.regenerate({
          assistantMessageId: original.assistantMessage.id,
          configuration,
        }),
      ),
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
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const submission = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Hello", configuration }),
    );
    const original = await Effect.runPromise(submission.settlement);

    if (original.outcome !== "completed") {
      throw new Error("Expected the original reply to complete.");
    }

    const failedAttempt = await Effect.runPromise(
      turns.regenerate({
        assistantMessageId: original.assistantMessage.id,
        configuration,
      }),
    );
    const failed = await Effect.runPromise(failedAttempt.settlement);

    if (failed.outcome !== "failed") {
      throw new Error("Expected regeneration to fail.");
    }

    expect(failed).toEqual(
      expect.objectContaining({
        outcome: "failed",
        failure: {
          cause: expect.objectContaining({
            cause: expect.objectContaining({
              _tag: "ProviderOperationError",
              providerId: "provider-a",
              operation: "generate",
              cause: regenerationFailure,
            }),
            message: regenerationFailure.message,
          }),
        },
        threadActivity: original.threadActivity,
      }),
    );
    expect(failed.failure.cause).toBeInstanceOf(ModelProviderError);
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([
      submission.acceptance.userMessage,
      original.assistantMessage,
    ]);

    const retryAttempt = await Effect.runPromise(
      turns.regenerate({
        assistantMessageId: original.assistantMessage.id,
        configuration,
      }),
    );
    const recovered = await Effect.runPromise(retryAttempt.settlement);

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
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const firstSubmission = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "First",
        configuration,
      }),
    );
    const first = await Effect.runPromise(firstSubmission.settlement);

    if (first.outcome !== "completed") {
      throw new Error("Expected the first reply to complete.");
    }

    const secondSubmission = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Second",
        configuration,
      }),
    );
    await Effect.runPromise(secondSubmission.settlement);

    await expect(
      Effect.runPromise(
        turns.regenerate({
          assistantMessageId: first.assistantMessage.id,
          configuration,
        }),
      ),
    ).rejects.toThrow(`Message "${first.assistantMessage.id}" is not the active thread reply.`);
    await expect(
      Effect.runPromise(
        turns.regenerate({
          assistantMessageId: firstSubmission.acceptance.userMessage.id,
          configuration,
        }),
      ),
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
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const independentThread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const first = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "First", configuration }),
    );

    expect(() =>
      turns.deleteFrom({
        threadId: thread.id,
        userMessageId: first.acceptance.userMessage.id,
      }),
    ).toThrow(`Thread "${thread.id}" already has an active operation.`);
    expect(() =>
      turns.editMessage({
        messageId: first.acceptance.userMessage.id,
        content: "Edited while generating",
      }),
    ).toThrow(`Thread "${thread.id}" already has an active operation.`);
    await expect(
      Effect.runPromise(turns.submit({ threadId: thread.id, content: "Too soon", configuration })),
    ).rejects.toThrow(`Thread "${thread.id}" already has an active operation.`);
    const independent = await Effect.runPromise(
      turns.submit({
        threadId: independentThread.id,
        content: "Independent",
        configuration,
      }),
    );
    await expect(Effect.runPromise(independent.settlement)).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );

    firstReply.resolve({ text: "First reply" });
    await Effect.runPromise(first.settlement);
    const second = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Second", configuration }),
    );
    await expect(Effect.runPromise(second.settlement)).resolves.toEqual(
      expect.objectContaining({ outcome: "completed", assistantActivated: true }),
    );
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toHaveLength(
      4,
    );
  });

  it("uses edited user and assistant content in subsequent model input", async () => {
    const generate = vi.fn<TestGenerate>(async () => ({ text: "Reply" }));
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    const first = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Original", configuration }),
    );
    const firstSettlement = await Effect.runPromise(first.settlement);

    if (firstSettlement.outcome !== "completed") {
      throw new Error("Expected the first reply to complete.");
    }

    expect(
      turns.editMessage({
        messageId: first.acceptance.userMessage.id,
        content: "Edited user message",
      }),
    ).toEqual({ ...first.acceptance.userMessage, content: "Edited user message" });
    expect(
      turns.editMessage({
        messageId: firstSettlement.assistantMessage.id,
        content: "Edited assistant message",
      }),
    ).toEqual({ ...firstSettlement.assistantMessage, content: "Edited assistant message" });

    const second = await Effect.runPromise(
      turns.submit({ threadId: thread.id, content: "Continue", configuration }),
    );
    await Effect.runPromise(second.settlement);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].input.dialogue).toEqual([
      expect.objectContaining({ role: "user", content: "Edited user message" }),
      expect.objectContaining({ role: "assistant", content: "Edited assistant message" }),
      expect.objectContaining({ role: "user", content: "Continue" }),
    ]);
  });

  it("deletes durable conversation state while retaining provider usage history", async () => {
    const generate = vi.fn(async () => ({ text: "Completed reply" }));
    const { database, threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const operation = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Delete this turn",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    );
    await Effect.runPromise(operation.settlement);
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
    const { database, generationEngine, threads } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const acceptanceFailure = new Error("Could not persist pending generation.");
    const turns = await scoped(
      createTurns(database, threads, {
        acceptRegenerationInTransaction: generationEngine.acceptRegenerationInTransaction,
        acceptReplyInTransaction() {
          throw acceptanceFailure;
        },
        listLatestForTurns: generationEngine.listLatestForTurns,
        resolveConfiguration: generationEngine.resolveConfiguration,
        executeAcceptedReply() {
          throw new Error("Generation must not be scheduled after failed acceptance.");
        },
      }),
    );

    await expect(
      Effect.runPromise(
        turns.submit({
          threadId: thread.id,
          content: "Do not retain this",
          configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
        }),
      ),
    ).rejects.toMatchObject({ _tag: "TurnAdmissionError", cause: acceptanceFailure });
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
    const { database, generationEngine, threads } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const settlementFailure = new Error("Could not schedule generation.");
    const settlement = deferred<never>();
    const turns = await scoped(
      createTurns(database, threads, {
        acceptRegenerationInTransaction: generationEngine.acceptRegenerationInTransaction,
        acceptReplyInTransaction: generationEngine.acceptReplyInTransaction,
        listLatestForTurns: generationEngine.listLatestForTurns,
        resolveConfiguration: generationEngine.resolveConfiguration,
        executeAcceptedReply: () =>
          Effect.tryPromise({ try: () => settlement.promise, catch: (cause) => cause }).pipe(
            Effect.orDie,
          ),
      }),
    );
    const operation = await Effect.runPromise(
      turns.submit({
        threadId: thread.id,
        content: "Hello",
        configuration: { model: { providerId: "provider-a", modelId: "maker/model" } },
      }),
    );

    expect(turns.inspect(thread.id)).toEqual({
      state: "generating",
      intent: "reply",
      turnId: operation.acceptance.userMessage.turnId,
      generationId: operation.acceptance.generation.id,
    });
    settlement.reject(settlementFailure);
    await expect(Effect.runPromise(operation.settlement)).rejects.toBe(settlementFailure);
    expect(turns.inspect(thread.id)).toEqual({ state: "idle" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects invalid work before accepting a turn", async () => {
    const generate = vi.fn(async () => ({ text: "Unused" }));
    const { threads, turns } = await openTurnEnvironment(generate);
    const thread = threads.create();
    const configuration = {
      model: { providerId: "provider-a", modelId: "maker/model" },
    };
    await expect(
      Effect.runPromise(
        Effect.interrupt.pipe(
          Effect.andThen(
            turns.submit({
              threadId: thread.id,
              content: "Hello",
              configuration,
            }),
          ),
        ),
      ),
    ).rejects.toThrow(/interrupt/i);
    await expect(
      Effect.runPromise(
        turns.submit({
          threadId: thread.id,
          content: "Hello",
          configuration: {
            model: { providerId: "missing-provider", modelId: "maker/model" },
          },
        }),
      ),
    ).rejects.toThrow('Unknown provider "missing-provider".');
    await expect(
      Effect.runPromise(turns.submit({ threadId: thread.id, content: "  ", configuration })),
    ).rejects.toMatchObject({ _tag: "TurnAdmissionError", cause: expect.any(TypeError) });
    await expect(
      Effect.runPromise(
        turns.submit({ threadId: ids.thread.create(), content: "Hello", configuration }),
      ),
    ).rejects.toMatchObject({ _tag: "TurnAdmissionError", cause: expect.any(RangeError) });
    expect(turns.listForThread({ threadId: thread.id, direction: "older" }).messages).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
