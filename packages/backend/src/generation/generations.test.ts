import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "../database/database";
import { ids } from "../id";
import { threadMessageTable } from "../thread/schema";
import { createThreads } from "../thread/threads";
import { createGenerations } from "./generations";
import { createTurnPromptCompiler } from "./prompt";
import type { GenerationProvider, GenerationProviderResult } from "./provider";
import { generationTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-generations-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function openGenerationEnvironment(provider: GenerationProvider, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const threads = createThreads(database, now);
  const generations = createGenerations(
    database,
    createTurnPromptCompiler(threads),
    [provider],
    now,
  );
  databases.push(database);
  return { database, generations, threads };
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
      messages: [{ role: "user", content: "Hello" }],
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
    await generations.generateReply({
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
        messages: [
          { role: "user", content: "First user message" },
          { role: "assistant", content: "First reply" },
          { role: "user", content: "Second user message" },
        ],
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
      expect.objectContaining({ messages: [{ role: "user", content: "Hello" }] }),
    );
    expect(threads.listMessages({ threadId: thread.id })).toEqual({
      messages: [started.message, regenerated.message],
    });
    expect(database.select().from(threadMessageTable).all()).toEqual(
      expect.arrayContaining([started.message, first.message, regenerated.message]),
    );
    expect(database.select().from(generationTable).all()).toHaveLength(2);
  });

  it("preserves a late reply as an inactive branch when the thread advances", async () => {
    const completion = deferred<GenerationProviderResult>();
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
    });
    expect(database.select().from(threadMessageTable).all()).toEqual(
      expect.arrayContaining([first.message, second.message, result.message]),
    );
  });

  it("allows only one pending generation for each turn", async () => {
    const completion = deferred<GenerationProviderResult>();
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
    const firstCompletion = deferred<GenerationProviderResult>();
    const secondCompletion = deferred<GenerationProviderResult>();
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
    });
  });

  it("records provider and invalid-output failures without creating messages", async () => {
    const failure = new Error("Provider unavailable");
    const provider = {
      id: "provider-a",
      generate: vi
        .fn<GenerationProvider["generate"]>()
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
    });
  });

  it("records interruption without waiting for an uncooperative provider", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => new Promise<GenerationProviderResult>(() => {})),
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

  it("rejects unknown and duplicate provider identities before persisting an attempt", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const compiler = createTurnPromptCompiler(threads);

    expect(() => createGenerations(database, compiler, [provider, provider])).toThrow(
      `Generation provider "${provider.id}" is registered more than once.`,
    );

    const generations = createGenerations(database, compiler, []);
    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        model: { providerId: "missing-provider", modelId: "maker/model" },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("stops waiting for an uncooperative prompt compiler when interrupted", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const compile = vi.fn(() => new Promise<never>(() => {}));
    const generations = createGenerations(database, { compile }, [provider]);
    const controller = new AbortController();
    const interruption = new Error("Prompt compilation interrupted by test.");
    const pending = generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(compile).toHaveBeenCalledWith(started.turn.id, controller.signal),
    );

    controller.abort(interruption);

    await expect(pending).rejects.toBe(interruption);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("rejects missing turns and malformed compiler output before generation", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations } = openGenerationEnvironment(provider);
    const missingTurnId = ids.turn.create();

    await expect(
      generations.generateReply({
        turnId: missingTurnId,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(`Turn "${missingTurnId}" does not exist.`);

    const mismatchedTurnId = ids.turn.create();
    const malformed = createGenerations(
      database,
      {
        compile: () => ({
          turnId: mismatchedTurnId,
          threadId: ids.thread.create(),
          inputMessageId: ids.message.create(),
          messages: [{ role: "user", content: "Hello" }],
        }),
      },
      [provider],
    );

    await expect(
      malformed.generateReply({
        turnId: ids.turn.create(),
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow("The generation prompt does not belong to turn");
    expect(database.select().from(generationTable).all()).toEqual([]);
  });
});
