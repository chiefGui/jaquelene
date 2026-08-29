import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import type { GenerationProvider, GenerationProviderResult } from "#backend/generation/provider";
import { ids } from "#backend/id";
import { StorageCategory } from "#backend/storage/storage";
import {
  createThreads,
  THREAD_MESSAGE_CONTENT_MAX_LENGTH,
  THREAD_MESSAGE_PAGE_SIZE,
} from "#backend/thread/threads";
import { createBackend, type BackendOptions } from "./backend";

const directories: string[] = [];

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-backend-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

function backendOptions(
  databasePath: string,
  generationProviders: readonly GenerationProvider[] = [],
): BackendOptions {
  return {
    databasePath,
    generationProviders,
    storageAreas: [],
  };
}

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("backend", () => {
  it("owns durable application services across close and reopen", async () => {
    const databasePath = createDatabasePath();
    const provider: GenerationProvider = {
      id: "provider-a",
      async generate() {
        return { text: "The voyage begins." };
      },
    };
    const first = await createBackend(backendOptions(databasePath, [provider]));
    const scenario = first.scenarios.create("Voyage");
    const campaign = first.campaigns.start(scenario.id);
    const submitted = await first.turns.submit({
      threadId: campaign.threadId,
      content: "Begin",
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    const firstClose = first.close();
    expect(first.close()).toBe(firstClose);
    await firstClose;

    expect(() => first.scenarios.list()).toThrow("Backend is closed.");
    await expect(first.storage.measureUsage()).rejects.toThrow("Backend is closed.");
    await expect(first.storage.deleteCategory(StorageCategory.Content)).rejects.toThrow(
      "Backend is closed.",
    );
    await expect(
      first.turns.submit({
        threadId: campaign.threadId,
        content: "Continue",
        model: { providerId: provider.id, modelId: "maker/model" },
      }),
    ).rejects.toThrow("Backend is closed.");

    const reopened = await createBackend(backendOptions(databasePath));

    expect(reopened.scenarios.get(scenario.id)).toEqual(scenario);
    expect(reopened.campaigns.get(campaign.id)).toEqual(campaign);
    expect(reopened.turns.listForThread({ threadId: campaign.threadId })).toEqual({
      messages: [submitted.userMessage, submitted.assistantMessage],
      generations: [submitted.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    await reopened.close();
  });

  it("interrupts and drains active generations before closing SQLite", async () => {
    const databasePath = createDatabasePath();
    const providerStarted = deferred<void>();
    let providerSignal: AbortSignal | undefined;
    const provider: GenerationProvider = {
      id: "provider-a",
      generate(request) {
        providerSignal = request.signal;
        providerStarted.resolve();
        return new Promise<GenerationProviderResult>(() => {});
      },
    };
    const backend = await createBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    await providerStarted.promise;

    const closing = backend.close();

    const interrupted = await pending;
    await closing;
    expect(providerSignal?.aborted).toBe(true);
    expect(interrupted.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    expect(interrupted.assistantMessage).toBeNull();

    const database = openDatabase(databasePath);

    try {
      expect(database.select().from(generationTable).get()).toEqual(
        expect.objectContaining({
          turnId: interrupted.turn.id,
          status: "failed",
          failureKind: "interrupted",
        }),
      );
    } finally {
      closeDatabase(database);
    }
  });

  it("keeps an immediately interrupted turn inspectable after reopening", async () => {
    const databasePath = createDatabasePath();
    const provider: GenerationProvider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: "Too late" })),
    };
    const backend = await createBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      model: { providerId: provider.id, modelId: "maker/model" },
    });

    const closing = backend.close();
    const interrupted = await pending;
    await closing;

    expect(provider.generate).not.toHaveBeenCalled();
    expect(interrupted.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    const reopened = await createBackend(backendOptions(databasePath));

    expect(reopened.turns.listForThread({ threadId: thread.id })).toEqual({
      messages: [interrupted.userMessage],
      generations: [interrupted.generation],
      pageSize: THREAD_MESSAGE_PAGE_SIZE,
      messageContentMaxLength: THREAD_MESSAGE_CONTENT_MAX_LENGTH,
    });
    await reopened.close();
  });

  it("recovers pending generations before exposing reopened services", async () => {
    const databasePath = createDatabasePath();
    const database = openDatabase(databasePath);
    const threads = createThreads(database, () => 100);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const pending = {
      id: ids.generation.create(),
      turnId: started.turn.id,
      providerId: "provider-a",
      modelId: "maker/model",
      status: "pending" as const,
      startedAt: 102,
    };
    database.insert(generationTable).values(pending).run();
    closeDatabase(database);

    const backend = await createBackend(backendOptions(databasePath));
    await backend.close();
    const recoveredDatabase = openDatabase(databasePath);

    try {
      expect(recoveredDatabase.select().from(generationTable).get()).toEqual(
        expect.objectContaining({
          id: pending.id,
          status: "failed",
          failureKind: "interrupted",
          finishedAt: expect.any(Number),
        }),
      );
    } finally {
      closeDatabase(recoveredDatabase);
    }
  });

  it("releases SQLite when application startup fails", async () => {
    const databasePath = createDatabasePath();
    const provider: GenerationProvider = {
      id: "duplicate-provider",
      async generate() {
        return { text: "Unused" };
      },
    };

    await expect(createBackend(backendOptions(databasePath, [provider, provider]))).rejects.toThrow(
      'Generation provider "duplicate-provider" is registered more than once.',
    );
    expect(() => rmSync(databasePath, { force: true })).not.toThrow();
  });

  it("rejects generation work once closing begins", async () => {
    const backend = await createBackend(backendOptions(createDatabasePath()));
    const closing = backend.close();

    await expect(
      backend.generations.generateReply({
        turnId: ids.turn.create(),
        model: { providerId: "provider-a", modelId: "maker/model" },
      }),
    ).rejects.toThrow("Backend is closed.");
    await closing;
  });
});
