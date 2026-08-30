import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import type {
  ProviderAdapter,
  ProviderGenerationAdapter,
  ProviderGenerationResult,
} from "#backend/provider/provider";
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
  providers: readonly ProviderAdapter[] = [],
): BackendOptions {
  return {
    databasePath,
    providers,
    storageAreas: [],
  };
}

function providerAdapter(id: string, generation?: ProviderGenerationAdapter): ProviderAdapter {
  return {
    descriptor: { id, name: id, brandId: id },
    configuration: { kind: "none" },
    models: { list: async () => [] },
    generation: generation ?? { generate: async () => ({ text: "Unused" }) },
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
    const provider = providerAdapter("provider-a", {
      async generate() {
        return { text: "The voyage begins." };
      },
    });
    const first = await createBackend(backendOptions(databasePath, [provider]));
    const scenario = first.scenarios.create("Voyage");
    const campaign = first.campaigns.start(scenario.id);
    const submittedOperation = first.turns.submit({
      threadId: campaign.threadId,
      content: "Begin",
      model: { providerId: provider.descriptor.id, modelId: "maker/model" },
    });
    const submitted = await submittedOperation.settlement;

    const firstClose = first.close();
    expect(first.close()).toBe(firstClose);
    await firstClose;

    expect(() => first.scenarios.list()).toThrow("Backend is closed.");
    await expect(first.storage.measureUsage()).rejects.toThrow("Backend is closed.");
    await expect(first.storage.deleteCategory(StorageCategory.Content)).rejects.toThrow(
      "Backend is closed.",
    );
    expect(() =>
      first.turns.submit({
        threadId: campaign.threadId,
        content: "Continue",
        model: { providerId: provider.descriptor.id, modelId: "maker/model" },
      }),
    ).toThrow("Backend is closed.");

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

  it("includes provider-owned configuration in application storage", async () => {
    const databasePath = createDatabasePath();
    const configurationPath = join(databasePath, "..", "provider-a.json");
    let configured = true;
    writeFileSync(configurationPath, Buffer.alloc(47));
    const provider = {
      ...providerAdapter("provider-a"),
      configuration: {
        kind: "api-key" as const,
        inspect: () =>
          configured
            ? ({ state: "configured" as const, keyLabel: "key...123" } as const)
            : ({ state: "unconfigured" as const } as const),
        async configure() {
          configured = true;
          return { state: "configured" as const, keyLabel: "key...123" };
        },
        async clear() {
          configured = false;
          rmSync(configurationPath, { force: true });
        },
        storagePaths: [configurationPath],
      },
    } satisfies ProviderAdapter;
    const backend = await createBackend(backendOptions(databasePath, [provider]));

    await expect(backend.storage.measureUsage()).resolves.toEqual(
      expect.objectContaining({
        categories: expect.arrayContaining([{ id: StorageCategory.AppData, bytes: 47 }]),
      }),
    );
    await backend.storage.deleteCategory(StorageCategory.AppData);
    expect(existsSync(configurationPath)).toBe(false);
    expect(backend.providers.inspectConfiguration(provider.descriptor.id)).toEqual({
      kind: "api-key",
      state: "unconfigured",
    });
    await backend.close();
  });

  it("interrupts and drains active generations before closing SQLite", async () => {
    const databasePath = createDatabasePath();
    const providerStarted = deferred<void>();
    let providerSignal: AbortSignal | undefined;
    const provider = providerAdapter("provider-a", {
      generate(_request, signal) {
        providerSignal = signal;
        providerStarted.resolve();
        return new Promise<ProviderGenerationResult>(() => {});
      },
    });
    const backend = await createBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      model: { providerId: provider.descriptor.id, modelId: "maker/model" },
    });
    await providerStarted.promise;

    const closing = backend.close();

    const interrupted = await pending.settlement;
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
    const generate = vi.fn(async () => ({ text: "Too late" }));
    const provider = providerAdapter("provider-a", { generate });
    const backend = await createBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      model: { providerId: provider.descriptor.id, modelId: "maker/model" },
    });

    const closing = backend.close();
    const interrupted = await pending.settlement;
    await closing;

    expect(generate).not.toHaveBeenCalled();
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
    const provider = providerAdapter("duplicate-provider");

    await expect(createBackend(backendOptions(databasePath, [provider, provider]))).rejects.toThrow(
      'Provider "duplicate-provider" is registered more than once.',
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
