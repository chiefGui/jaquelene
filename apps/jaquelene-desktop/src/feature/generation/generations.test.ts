import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "@/database";
import { createThreads } from "@/feature/thread/threads";
import { ids } from "@/id";
import { createGenerations } from "./generations";
import { createThreadPromptCompiler } from "./prompt";
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
    createThreadPromptCompiler(threads),
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
  it("routes a prompt by provider identity and atomically stores the assistant reply", async () => {
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
    const userMessage = threads.appendUserMessage(thread.id, "Hello");

    const result = await generations.generateReply({
      threadId: thread.id,
      model: { providerId: provider.id, modelId: "maker/requested-model" },
    });

    expect(generate).toHaveBeenCalledWith({
      generationId: result.generation.id,
      threadId: thread.id,
      modelId: "maker/requested-model",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.message).toEqual({
      id: expect.stringMatching(/^message_/),
      threadId: thread.id,
      sequence: 2,
      author: "assistant",
      content: "Assistant reply",
      createdAt: 103,
    });
    expect(result.generation).toEqual({
      id: result.generation.id,
      threadId: thread.id,
      contextSequence: userMessage.sequence,
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
      outputMessageId: result.message.id,
      startedAt: 102,
      finishedAt: 103,
    });
    expect(database.select().from(generationTable).get()).toEqual(result.generation);
    expect(threads.listAllMessages(thread.id)).toEqual([userMessage, result.message]);
  });

  it("records provider failures without creating an assistant message", async () => {
    let timestamp = 200;
    const failure = new Error("Provider unavailable");
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => {
        throw failure;
      }),
    };
    const { database, generations, threads } = openGenerationEnvironment(
      provider,
      () => timestamp++,
    );
    const thread = threads.create();
    const userMessage = threads.appendUserMessage(thread.id, "Hello");

    await expect(
      generations.generateReply({
        threadId: thread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toBe(failure);

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        threadId: thread.id,
        contextSequence: userMessage.sequence,
        status: "failed",
        failureKind: "provider",
        outputMessageId: null,
        startedAt: 202,
        finishedAt: 203,
      }),
    );
    expect(threads.listAllMessages(thread.id)).toEqual([userMessage]);
  });

  it("rejects invalid provider output and records the failed attempt", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: " \n\t " })),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    threads.appendUserMessage(thread.id, "Hello");

    await expect(
      generations.generateReply({
        threadId: thread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(TypeError);
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "invalid-output" }),
    );
    expect(threads.listAllMessages(thread.id)).toHaveLength(1);
  });

  it("allows only one pending generation for a thread", async () => {
    const completion = deferred<GenerationProviderResult>();
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => completion.promise),
    };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    threads.appendUserMessage(thread.id, "Hello");
    const request = {
      threadId: thread.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    };
    const firstGeneration = generations.generateReply(request);

    await expect(generations.generateReply(request)).rejects.toThrow(
      `Thread "${thread.id}" already has a pending generation.`,
    );
    expect(provider.generate).toHaveBeenCalledOnce();

    completion.resolve({ text: "Reply" });
    await expect(firstGeneration).resolves.toEqual(
      expect.objectContaining({ message: expect.objectContaining({ content: "Reply" }) }),
    );
  });

  it("does not append a stale reply when the thread changes during generation", async () => {
    const completion = deferred<GenerationProviderResult>();
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => completion.promise),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    threads.appendUserMessage(thread.id, "First user message");
    const generation = generations.generateReply({
      threadId: thread.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    const newerMessage = threads.appendUserMessage(thread.id, "Newer user message");
    completion.resolve({
      text: "Stale reply",
      providerGenerationId: "superseded-provider-generation",
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
    });

    await expect(generation).rejects.toThrow("was superseded by a newer message");
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        status: "failed",
        failureKind: "superseded",
        providerGenerationId: "superseded-provider-generation",
        inputTokens: 8,
        outputTokens: 3,
        totalTokens: 11,
      }),
    );
    expect(threads.listAllMessages(thread.id).at(-1)).toEqual(newerMessage);
  });

  it("rolls back the assistant message when completion persistence fails", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const userMessage = threads.appendUserMessage(thread.id, "Hello");

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
        threadId: thread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow();

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "storage" }),
    );
    expect(threads.listAllMessages(thread.id)).toEqual([userMessage]);
    expect(threads.appendUserMessage(thread.id, "After failure").sequence).toBe(2);
  });

  it("releases the thread when failed provider metadata cannot be stored", async () => {
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
    threads.appendUserMessage(firstThread.id, "First thread");
    await generations.generateReply({
      threadId: firstThread.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    const secondThread = threads.create();
    const userMessage = threads.appendUserMessage(secondThread.id, "Second thread");

    await expect(
      generations.generateReply({
        threadId: secondThread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow();

    expect(
      database
        .select()
        .from(generationTable)
        .where(eq(generationTable.threadId, secondThread.id))
        .get(),
    ).toEqual(
      expect.objectContaining({
        status: "failed",
        failureKind: "storage",
        providerGenerationId: null,
      }),
    );
    expect(threads.listAllMessages(secondThread.id)).toEqual([userMessage]);

    await expect(
      generations.generateReply({
        threadId: secondThread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        message: expect.objectContaining({ sequence: 2, content: "Reply" }),
      }),
    );
  });

  it("recovers pending attempts left behind by an interrupted process", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider, () => 500);
    const thread = threads.create();
    const userMessage = threads.appendUserMessage(thread.id, "Hello");

    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        threadId: thread.id,
        contextSequence: userMessage.sequence,
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

  it("enforces generation state and single-pending-attempt constraints in storage", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const userMessage = threads.appendUserMessage(thread.id, "Hello");
    const pending = {
      threadId: thread.id,
      contextSequence: userMessage.sequence,
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
          ...pending,
          status: "completed",
          finishedAt: 701,
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          ...pending,
          status: "failed",
          failureKind: "provider",
          inputTokens: 1,
          finishedAt: 701,
        })
        .run(),
    ).toThrow();
  });

  it("is removed with its owning thread", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    threads.appendUserMessage(thread.id, "Hello");
    await generations.generateReply({
      threadId: thread.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    expect(() =>
      database.$client.prepare("DELETE FROM threads WHERE id = ?").run(thread.id),
    ).not.toThrow();
    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(threads.get(thread.id)).toBeNull();
  });

  it("rejects unknown and duplicate provider identities", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    threads.appendUserMessage(thread.id, "Hello");
    const compiler = createThreadPromptCompiler(threads);

    expect(() => createGenerations(database, compiler, [provider, provider])).toThrow(
      `Generation provider "${provider.id}" is registered more than once.`,
    );

    const generations = createGenerations(database, compiler, []);
    await expect(
      generations.generateReply({
        threadId: thread.id,
        model: { providerId: "missing-provider", modelId: "maker/model" },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("requires a user message at the end of the prompt", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();

    await expect(
      generations.generateReply({
        threadId: thread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(`Thread "${thread.id}" has no messages to generate from.`);

    threads.appendUserMessage(thread.id, "Hello");
    await generations.generateReply({
      threadId: thread.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    await expect(
      generations.generateReply({
        threadId: thread.id,
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow(`Thread "${thread.id}" does not end with a user message.`);
  });
});
