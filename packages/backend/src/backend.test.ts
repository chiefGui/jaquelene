import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createBackend, type BackendOptions } from "./backend";
import { closeDatabase, openDatabase } from "./database/database";
import { generationTable } from "./generation/schema";
import type { GenerationProvider, GenerationProviderResult } from "./generation/provider";
import { ids } from "./id";
import { createThreads } from "./thread/threads";

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
    storageManifest: { userContent: [databasePath], applicationData: [] },
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
    const first = await createBackend(backendOptions(databasePath));
    const scenario = first.scenarios.create("Voyage");
    const campaign = first.campaigns.start(scenario.id);
    const started = first.threads.startTurn(campaign.threadId, "Begin");

    const firstClose = first.close();
    expect(first.close()).toBe(firstClose);
    await firstClose;

    expect(() => first.scenarios.list()).toThrow("Backend is closed.");
    await expect(first.storage.measureUsage()).rejects.toThrow("Backend is closed.");

    const reopened = await createBackend(backendOptions(databasePath));

    expect(reopened.scenarios.get(scenario.id)).toEqual(scenario);
    expect(reopened.campaigns.get(campaign.id)).toEqual(campaign);
    expect(reopened.threads.listMessages({ threadId: campaign.threadId })).toEqual({
      messages: [started.message],
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
    const started = backend.threads.startTurn(thread.id, "Hello");
    const pending = backend.generations.generateReply({
      turnId: started.turn.id,
      model: { providerId: provider.id, modelId: "maker/model" },
    });
    await providerStarted.promise;

    const closing = backend.close();

    await expect(pending).rejects.toThrow("Backend is closing.");
    await closing;
    expect(providerSignal?.aborted).toBe(true);

    const database = openDatabase(databasePath);

    try {
      expect(database.select().from(generationTable).get()).toEqual(
        expect.objectContaining({
          turnId: started.turn.id,
          status: "failed",
          failureKind: "interrupted",
        }),
      );
    } finally {
      closeDatabase(database);
    }
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
