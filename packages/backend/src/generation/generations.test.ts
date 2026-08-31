import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import { createScenarios } from "#backend/scenario/scenarios";
import { factoryDefaultRoleplaySystemInstruction } from "#backend/system-instruction/system-instructions";
import { threadMessageTable } from "#backend/thread/schema";
import {
  createThreads,
  THREAD_MESSAGE_CONTENT_MAX_LENGTH,
  THREAD_MESSAGE_PAGE_SIZE,
} from "#backend/thread/threads";
import { createGenerations } from "./generations";
import { createReplyPreparer, type ReplyAnchor } from "./reply-preparation";
import { generationTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-generations-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

type TestGenerationProvider = {
  id: string;
  generate: (
    request: ProviderGenerationRequest & { signal?: AbortSignal },
  ) => Promise<ProviderGenerationResult>;
};

function generationRouter(provider?: TestGenerationProvider): ProviderGenerationRouter {
  return {
    get(providerId) {
      if (!provider || provider.id !== providerId) {
        return undefined;
      }

      return {
        generate: (request, signal) =>
          provider.generate({ ...request, ...(signal ? { signal } : {}) }),
      };
    },
  };
}

function openGenerationEnvironment(provider: TestGenerationProvider, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const campaigns = createCampaigns(database, now);
  const scenarios = createScenarios(database);
  const threads = createThreads(database, now);
  const generations = createGenerations(
    database,
    createReplyPreparer(threads, campaigns),
    generationRouter(provider),
    now,
  );
  databases.push(database);
  return { campaigns, database, generations, scenarios, threads };
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

describe("generations", () => {
  it("routes a turn prompt and atomically stores its assistant reply", async () => {
    let timestamp = 100;
    const generate = vi.fn(async () => ({
      text: "Assistant reply",
      providerGenerationId: "provider-generation-1",
      resolvedModelId: "maker/resolved-model",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
    }));
    const provider = { id: "provider-a", generate };
    const { database, generations, threads } = openGenerationEnvironment(
      provider,
      () => timestamp++,
    );
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    const result = await generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/requested-model" },
    });

    expect(generate).toHaveBeenCalledWith({
      generationId: result.generation.id,
      threadId: thread.id,
      modelId: "maker/requested-model",
      input: {
        instructions: [],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Hello" }],
      },
    });
    expect(result).toEqual({
      activated: true,
      message: {
        id: expect.stringMatching(/^message_/),
        threadId: thread.id,
        turnId: started.turn.id,
        parentMessageId: started.message.id,
        sequence: 2,
        author: "assistant",
        content: "Assistant reply",
        createdAt: 103,
      },
      generation: {
        id: expect.stringMatching(/^generation_/),
        turnId: started.turn.id,
        providerId: provider.id,
        modelId: "maker/requested-model",
        status: "completed",
        failureKind: null,
        providerGenerationId: "provider-generation-1",
        resolvedModelId: "maker/resolved-model",
        finishReason: "stop",
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
        outputMessageId: expect.stringMatching(/^message_/),
        startedAt: 102,
        finishedAt: 103,
      },
    });
    expect(result.generation.outputMessageId).toBe(result.message.id);
    expect(database.select().from(generationTable).get()).toEqual(result.generation);
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message, result.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("includes the factory narrator instruction for campaign replies", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { campaigns, generations, scenarios, threads } = openGenerationEnvironment(provider);
    const scenario = scenarios.create("The Long Night");
    const campaign = campaigns.start(scenario.id);
    const started = threads.startTurn(campaign.threadId, "Begin");

    await generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    expect(provider.generate).toHaveBeenCalledWith({
      generationId: expect.stringMatching(/^generation_/),
      threadId: campaign.threadId,
      modelId: "maker/model",
      input: {
        instructions: [
          {
            sourceKey: factoryDefaultRoleplaySystemInstruction.key,
            content: factoryDefaultRoleplaySystemInstruction.content,
          },
        ],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Begin" }],
      },
    });
  });

  it("compiles only the selected turn ancestry", async () => {
    const replies = ["First reply", "Second reply"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: replies.shift() ?? "Unexpected reply" })),
    };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const firstReply = await generations.generateReply({
      turnId: first.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    const second = threads.startTurn(thread.id, "Second user message");

    await generations.generateReply({
      turnId: second.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    expect(provider.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          instructions: [],
          dialogue: [
            { messageId: first.message.id, role: "user", content: "First user message" },
            {
              messageId: firstReply.message.id,
              role: "assistant",
              content: "First reply",
            },
            { messageId: second.message.id, role: "user", content: "Second user message" },
          ],
        },
      }),
    );
  });

  it("regenerates a turn as a sibling output and selects the new branch", async () => {
    const replies = ["First reply", "Regenerated reply"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: replies.shift() ?? "Unexpected reply" })),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const first = await generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    const regenerated = await generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    expect(regenerated.activated).toBe(true);
    expect(regenerated.message.parentMessageId).toBe(started.message.id);
    expect(provider.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          instructions: [],
          dialogue: [{ messageId: started.message.id, role: "user", content: "Hello" }],
        },
      }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message, regenerated.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    expect(database.select().from(threadMessageTable).all()).toEqual(
      expect.arrayContaining([started.message, first.message, regenerated.message]),
    );
    expect(database.select().from(generationTable).all()).toHaveLength(2);
  });

  it("preserves a late reply as an inactive branch when the thread advances", async () => {
    const completion = deferred<ProviderGenerationResult>();
    const provider = { id: "provider-a", generate: vi.fn(() => completion.promise) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const pending = generations.generateReply({
      turnId: first.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());
    const second = threads.startTurn(thread.id, "Newer user message");

    completion.resolve({
      text: "Late reply",
      providerGenerationId: "late-provider-generation",
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
    });
    const result = await pending;

    expect(result.activated).toBe(false);
    expect(result.generation).toEqual(
      expect.objectContaining({
        status: "completed",
        providerGenerationId: "late-provider-generation",
        outputMessageId: result.message.id,
      }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first.message, second.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    expect(database.select().from(threadMessageTable).all()).toEqual(
      expect.arrayContaining([first.message, second.message, result.message]),
    );
  });

  it("snapshots the active branch before asynchronous reply preparation", async () => {
    const preparedInput = deferred<ModelInput>();
    const anchors: ReplyAnchor[] = [];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: "Late reply" })),
    };
    const { database, threads } = openGenerationEnvironment(provider);
    const generations = createGenerations(
      database,
      {
        prepare(anchor) {
          anchors.push(anchor);
          return preparedInput.promise;
        },
      },
      generationRouter(provider),
    );
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const model = { providerId: provider.id, modelId: "maker/model" };
    const pending = generations.generateReply({
      turnId: first.turn.id,
      model,
    });
    model.modelId = "mutated/model";
    const second = threads.startTurn(thread.id, "Newer user message");

    const acceptedAnchor = anchors[0];

    if (!acceptedAnchor) {
      throw new Error("Expected reply preparation to receive an accepted anchor.");
    }

    preparedInput.resolve({
      instructions: [],
      dialogue: [
        {
          messageId: first.message.id,
          role: "user",
          content: "First user message",
        },
      ],
    });
    const result = await pending;

    expect(result.activated).toBe(false);
    expect(result.generation.modelId).toBe("maker/model");
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "maker/model" }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first.message, second.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("allows only one pending generation for each turn", async () => {
    const completion = deferred<ProviderGenerationResult>();
    const provider = { id: "provider-a", generate: vi.fn(() => completion.promise) };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const request = {
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    };
    const firstGeneration = generations.generateReply(request);

    await expect(generations.generateReply(request)).rejects.toThrow(
      `Turn "${started.turn.id}" already has a pending generation.`,
    );
    expect(provider.generate).toHaveBeenCalledOnce();

    completion.resolve({ text: "Reply" });
    await expect(firstGeneration).resolves.toEqual(
      expect.objectContaining({ message: expect.objectContaining({ content: "Reply" }) }),
    );
  });

  it("allows independent turns to generate concurrently without racing the active head", async () => {
    const firstCompletion = deferred<ProviderGenerationResult>();
    const secondCompletion = deferred<ProviderGenerationResult>();
    const completions = [firstCompletion, secondCompletion];
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => {
        const completion = completions.shift();

        if (!completion) {
          throw new Error("The test provider received an unexpected request.");
        }

        return completion.promise;
      }),
    };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First");
    const second = threads.startTurn(thread.id, "Second");
    const firstGeneration = generations.generateReply({
      turnId: first.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    const secondGeneration = generations.generateReply({
      turnId: second.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledTimes(2));

    secondCompletion.resolve({ text: "Second reply" });
    const secondResult = await secondGeneration;
    firstCompletion.resolve({ text: "First reply" });
    const firstResult = await firstGeneration;

    expect(secondResult.activated).toBe(true);
    expect(firstResult.activated).toBe(false);
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [first.message, second.message, secondResult.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("records provider and invalid-output failures without creating messages", async () => {
    const failure = new Error("Provider unavailable");
    const provider = {
      id: "provider-a",
      generate: vi
        .fn<TestGenerationProvider["generate"]>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ text: " \n\t " }),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toBe(failure);
    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(TypeError);

    expect(database.select().from(generationTable).all()).toEqual([
      expect.objectContaining({ turnId: started.turn.id, failureKind: "provider" }),
      expect.objectContaining({ turnId: started.turn.id, failureKind: "invalid-output" }),
    ]);
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("records interruption without waiting for an uncooperative provider", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => new Promise<ProviderGenerationResult>(() => {})),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const controller = new AbortController();
    const interruption = new Error("Generation interrupted by test.");
    const pending = generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());

    controller.abort(interruption);

    await expect(pending).rejects.toBe(interruption);
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
  });

  it("rolls back the assistant message and head when completion storage fails", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    database.$client.exec(`
      CREATE TRIGGER reject_generation_completion
      BEFORE UPDATE OF status ON generations
      WHEN NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END;
    `);

    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow();

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "storage" }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    expect(threads.startTurn(thread.id, "After failure").message.sequence).toBe(2);
  });

  it("releases a turn when failed provider metadata cannot be stored", async () => {
    const providerGenerationIds = ["shared-generation", "shared-generation", "retry-generation"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => {
        const providerGenerationId = providerGenerationIds.shift();

        if (!providerGenerationId) {
          throw new Error("The test provider received an unexpected request.");
        }

        return { text: "Reply", providerGenerationId };
      }),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const firstThread = threads.create();
    const first = threads.startTurn(firstThread.id, "First thread");
    await generations.generateReply({
      turnId: first.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    const secondThread = threads.create();
    const second = threads.startTurn(secondThread.id, "Second thread");

    await expect(
      generations.generateReply({
        turnId: second.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow();

    expect(
      database
        .select()
        .from(generationTable)
        .where(eq(generationTable.turnId, second.turn.id))
        .get(),
    ).toEqual(
      expect.objectContaining({
        status: "failed",
        failureKind: "storage",
        providerGenerationId: null,
      }),
    );
    expect(threads.listMessages({ threadId: secondThread.id })).toEqual({
      messages: [second.message],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });

    await expect(
      generations.generateReply({
        turnId: second.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        message: expect.objectContaining({ sequence: 2, content: "Reply" }),
      }),
    );
  });

  it("recovers pending attempts left by an interrupted process", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider, () => 500);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId: started.turn.id,
        providerId: provider.id,
        modelId: "maker/model",
        status: "pending",
        startedAt: 600,
      })
      .run();

    generations.recoverInterrupted();

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        status: "failed",
        failureKind: "interrupted",
        startedAt: 600,
        finishedAt: 600,
      }),
    );
  });

  it("enforces generation state, ownership, and pending-attempt constraints", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First");
    const second = threads.startTurn(thread.id, "Second");
    const pending = {
      turnId: first.turn.id,
      providerId: provider.id,
      modelId: "maker/model",
      status: "pending",
      startedAt: 700,
    } as const;

    database
      .insert(generationTable)
      .values({ id: ids.generation.create(), ...pending })
      .run();

    expect(() =>
      database
        .insert(generationTable)
        .values({ id: ids.generation.create(), ...pending })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          turnId: second.turn.id,
          providerId: provider.id,
          modelId: "maker/model",
          status: "completed",
          outputMessageId: first.message.id,
          startedAt: 700,
          finishedAt: 701,
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          turnId: second.turn.id,
          providerId: provider.id,
          modelId: "maker/model",
          status: "failed",
          failureKind: "provider",
          inputTokens: 1,
          startedAt: 700,
          finishedAt: 701,
        })
        .run(),
    ).toThrow();
  });

  it("removes turns, messages, and generations with their owning thread", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    await generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    expect(() =>
      database.$client.prepare("DELETE FROM threads WHERE id = ?").run(thread.id),
    ).not.toThrow();
    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(threadMessageTable).all()).toEqual([]);
    expect(threads.get(thread.id)).toBeNull();
  });

  it("rejects an unknown provider identity before persisting an attempt", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { campaigns, database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const preparer = createReplyPreparer(threads, campaigns);

    const generations = createGenerations(database, preparer, generationRouter());
    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        model: { providerId: "missing-provider", modelId: "maker/model" },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("stops waiting for uncooperative reply preparation when interrupted", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const prepare = vi.fn(() => new Promise<never>(() => {}));
    const generations = createGenerations(database, { prepare }, generationRouter(provider));
    const controller = new AbortController();
    const interruption = new Error("Reply preparation interrupted by test.");
    const pending = generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          turnId: started.turn.id,
          threadId: thread.id,
          inputMessageId: started.message.id,
        }),
        controller.signal,
      ),
    );

    controller.abort(interruption);

    await expect(pending).rejects.toBe(interruption);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        turnId: started.turn.id,
        status: "failed",
        failureKind: "interrupted",
      }),
    );
  });

  it("rejects missing turns and records malformed preparation before provider work", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const missingTurnId = ids.turn.create();

    await expect(
      generations.generateReply({
        turnId: missingTurnId,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(`Turn "${missingTurnId}" does not exist.`);

    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const malformed = createGenerations(
      database,
      {
        prepare: () => ({
          instructions: [],
          dialogue: [{ messageId: ids.message.create(), role: "user", content: "Hello" }],
        }),
      },
      generationRouter(provider),
    );

    await expect(
      malformed.generateReply({
        turnId: started.turn.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow("A prepared reply must end with its accepted user input.");
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([
      expect.objectContaining({
        turnId: started.turn.id,
        status: "failed",
        failureKind: "prompt",
      }),
    ]);
  });
});
