import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodePath from "@effect/platform-node/NodePath";
import { PromptOrigin } from "@jaquelene/domain";
import { Layer, ManagedRuntime } from "effect";
import { nodeFileTreeLayer } from "#backend/filesystem/node-file-tree";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import type {
  ProviderAdapter,
  ProviderFactory,
  ProviderGenerationAdapter,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import {
  StorageCategory,
  type StorageAreaId,
  type StorageCategory as StorageCategoryValue,
  type StorageDeletion,
  type StorageUsage,
} from "#backend/storage/storage";
import { jaqueleneNarratorPromptDefinition, narratorPromptKind } from "#backend/narrator/module";
import {
  createThreads,
  THREAD_MESSAGE_MAX_CODE_UNITS,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "#backend/thread/threads";
import { BackendService, type Backend, type BackendOptions } from "./backend";

const directories: string[] = [];

function threadPageMetadata(messages: readonly { content: string }[]) {
  return {
    messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
    messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
    contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
    contentBytes: messages.reduce((total, { content }) => total + Buffer.byteLength(content), 0),
  };
}

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
    cache: {
      path: join(databasePath, "..", "jaquelene-cache.sqlite"),
      reportFailure: () => undefined,
    },
    providers: providers.map(
      (provider) =>
        ({
          id: provider.descriptor.id,
          storagePaths:
            provider.configuration.kind === "api-key" ? provider.configuration.storagePaths : [],
          create: () => provider,
        }) satisfies ProviderFactory,
    ),
    storageAreas: [],
  };
}

function providerAdapter(id: string, generation?: ProviderGenerationAdapter): ProviderAdapter {
  return {
    descriptor: { id, name: id, brandId: id },
    configuration: { kind: "none" },
    models: {
      list: async () => [{ id: "maker/model", name: "Model", brandId: "maker" }],
    },
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

type TestStorage = Readonly<{
  measureUsage: () => Promise<StorageUsage>;
  deleteArea: (id: StorageAreaId) => Promise<StorageDeletion>;
  deleteCategory: (id: StorageCategoryValue) => Promise<StorageDeletion>;
}>;

type TestBackend = Omit<Backend, "storage"> &
  Readonly<{
    storage: TestStorage;
    close: () => Promise<void>;
    [Symbol.asyncDispose]: () => Promise<void>;
  }>;

async function openBackend(options: BackendOptions, signal?: AbortSignal): Promise<TestBackend> {
  const runtime = ManagedRuntime.make(
    BackendService.layer(options).pipe(
      Layer.provide(nodeFileTreeLayer),
      Layer.provide(NodePath.layer),
    ),
  );
  let backend: Backend;

  try {
    backend = await runtime.runPromise(BackendService, { signal });
  } catch (startupCause) {
    let startupFailure = startupCause;

    if (signal?.aborted) {
      startupFailure = signal.reason;
    }

    const failures: unknown[] = [startupFailure];

    try {
      await runtime.dispose();
    } catch (closeFailure) {
      failures.push(closeFailure);
    }

    if (failures.length > 1) {
      throw new AggregateError(failures, "Could not close the backend after startup failed.");
    }

    throw startupFailure;
  }

  let closePromise: Promise<void> | undefined;
  const close = () => {
    closePromise ??= runtime.dispose();
    return closePromise;
  };

  return {
    ...backend,
    storage: {
      measureUsage: () => runtime.runPromise(backend.storage.measureUsage()),
      deleteArea: (id) => runtime.runPromise(backend.storage.deleteArea(id)),
      deleteCategory: (id) => runtime.runPromise(backend.storage.deleteCategory(id)),
    },
    close,
    [Symbol.asyncDispose]: close,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("backend", () => {
  it("rejects cache storage that overlaps authoritative content before opening it", async () => {
    const databasePath = createDatabasePath();
    const options = backendOptions(databasePath);

    await expect(
      openBackend({ ...options, cache: { ...options.cache, path: databasePath } }),
    ).rejects.toThrow(`Storage path "${databasePath}" is registered more than once.`);
    expect(existsSync(databasePath)).toBe(false);
  });

  it("serves a persisted model catalog without repeating the remote request after restart", async () => {
    const databasePath = createDatabasePath();
    const firstList = vi.fn(async () => [
      {
        id: "maker/model",
        name: "Model",
        brandId: "maker",
        contextWindowTokens: 128_000,
        reasoning: { defaultPreset: "high" as const, supportedPresets: ["high"] as const },
      },
    ]);
    const first = await openBackend(
      backendOptions(databasePath, [
        {
          ...providerAdapter("provider-a"),
          models: { list: firstList },
        },
      ]),
    );

    await expect(first.models.getModels("provider-a")).resolves.toMatchObject({
      models: [
        {
          id: "maker/model",
          name: "Model",
          brandId: "maker",
          contextWindowTokens: 128_000,
          reasoning: { defaultPreset: "high", supportedPresets: ["high"] },
        },
      ],
      freshness: "fresh",
    });
    await expect(
      first.models.getModel({ providerId: "provider-a", modelId: "maker/model" }),
    ).resolves.toMatchObject({ id: "maker/model", name: "Model" });
    await expect(
      first.models.getModel({ providerId: "provider-a", modelId: "maker/missing" }),
    ).rejects.toThrow('does not expose model "maker/missing"');
    expect(firstList).toHaveBeenCalledOnce();
    await first.close();

    const secondList = vi.fn(async () => {
      throw new Error("The remote catalog should not be requested while the snapshot is fresh.");
    });
    const reopened = await openBackend(
      backendOptions(databasePath, [
        {
          ...providerAdapter("provider-a"),
          models: { list: secondList },
        },
      ]),
    );

    await expect(reopened.models.getModels("provider-a")).resolves.toMatchObject({
      models: [
        {
          id: "maker/model",
          name: "Model",
          brandId: "maker",
          contextWindowTokens: 128_000,
          reasoning: { defaultPreset: "high", supportedPresets: ["high"] },
        },
      ],
      freshness: "fresh",
    });
    expect(secondList).not.toHaveBeenCalled();
    await reopened.close();
  });

  it("clears derived snapshots through the cache storage owner", async () => {
    const databasePath = createDatabasePath();
    const list = vi.fn(async () => [{ id: "maker/model", name: "Model", brandId: "maker" }]);
    const backend = await openBackend(
      backendOptions(databasePath, [
        {
          ...providerAdapter("provider-a"),
          models: { list },
        },
      ]),
    );
    const changes: number[] = [];
    const unsubscribe = backend.models.subscribe((_providerId, revision) => {
      changes.push(revision);
    });

    await backend.models.getModels("provider-a");
    expect(list).toHaveBeenCalledOnce();
    const changesBeforeClear = changes.length;
    await backend.storage.deleteCategory(StorageCategory.Cache);
    expect(changes).toHaveLength(changesBeforeClear + 1);
    await backend.models.getModels("provider-a");
    expect(list).toHaveBeenCalledTimes(2);
    unsubscribe();
    await backend.close();
  });

  it("owns durable application services across close and reopen", async () => {
    const databasePath = createDatabasePath();
    const provider = providerAdapter("provider-a", {
      async generate() {
        return { text: "The voyage begins." };
      },
    });
    const first = await openBackend(backendOptions(databasePath, [provider]));
    expect(first.prompts.listKinds()).toEqual([narratorPromptKind]);
    expect(first.prompts.list({ kind: narratorPromptKind.key }).prompts).toEqual([
      {
        ...jaqueleneNarratorPromptDefinition,
        kind: narratorPromptKind.key,
        origin: PromptOrigin.BuiltIn,
      },
    ]);
    const campaign = first.campaigns.start({
      title: "Voyage",
      composition: [{ kind: narratorPromptKind.key }],
    });
    const submittedOperation = await first.turns.submit({
      threadId: campaign.threadId,
      content: "Begin",
      configuration: {
        model: { providerId: provider.descriptor.id, modelId: "maker/model" },
      },
    });
    const submitted = await submittedOperation.settlement;

    if (submitted.outcome !== "completed") {
      throw new Error("Expected the submitted reply to complete.");
    }

    const campaignUsage = {
      campaignId: campaign.id,
      attempts: { provider: 1, preparing: 0, pending: 0, completed: 1, failed: 0 },
      tokenCoverage: { reported: 0, unknown: 1 },
      costCoverage: { reported: 0, unknown: 1 },
      costs: [],
      models: [
        {
          providerId: provider.descriptor.id,
          requestedModelId: "maker/model",
          attempts: 1,
        },
      ],
    };
    expect(first.campaignUsage.get(campaign.id)).toEqual(campaignUsage);

    await first.close();

    const reopened = await openBackend(backendOptions(databasePath));

    expect(reopened.campaigns.get(campaign.id)).toEqual({
      ...campaign,
      lastActivityAt: submitted.threadActivity.lastActivityAt,
      turnCount: submitted.threadActivity.turnCount,
    });
    expect(reopened.campaignUsage.get(campaign.id)).toEqual(campaignUsage);
    expect(
      reopened.turns.listForThread({ threadId: campaign.threadId, direction: "older" }),
    ).toEqual({
      messages: [submitted.userMessage, submitted.assistantMessage],
      generations: [submitted.generation],
      ...threadPageMetadata([submitted.userMessage, submitted.assistantMessage]),
    });
    await reopened.close();
  });

  it("uses an edited narrator prompt on the next turn of an existing campaign", async () => {
    const inputs: ModelInput[] = [];
    const provider = providerAdapter("provider-a", {
      async generate({ input }) {
        inputs.push(input);
        return { text: `Reply ${inputs.length}` };
      },
    });
    await using backend = await openBackend(backendOptions(createDatabasePath(), [provider]));
    const prompt = backend.prompts.create({
      kind: narratorPromptKind.key,
      title: "Private organizer",
      body: "Use a hopeful tone.",
    });
    const campaign = backend.campaigns.start({
      title: "Changing direction",
      composition: [{ kind: narratorPromptKind.key, promptKey: prompt.key }],
    });
    const configuration = {
      model: { providerId: provider.descriptor.id, modelId: "maker/model" },
    };

    await (
      await backend.turns.submit({
        threadId: campaign.threadId,
        content: "Begin",
        configuration,
      })
    ).settlement;
    backend.prompts.update(prompt.key, {
      title: "Still private",
      body: "Use an ominous tone.",
    });
    await (
      await backend.turns.submit({
        threadId: campaign.threadId,
        content: "Continue",
        configuration,
      })
    ).settlement;

    expect(inputs.map(({ instructions }) => instructions)).toEqual([
      [{ sourceKey: prompt.key, content: "Use a hopeful tone." }],
      [{ sourceKey: prompt.key, content: "Use an ominous tone." }],
    ]);
    expect(
      backend.threads
        .getTranscript(campaign.threadId)
        .entries.map(({ kind, content }) => ({ kind, content })),
    ).toEqual([
      { kind: "instruction", content: "Use an ominous tone." },
      { kind: "message", content: "Begin" },
      { kind: "message", content: "Reply 1" },
      { kind: "message", content: "Continue" },
      { kind: "message", content: "Reply 2" },
    ]);
    expect(JSON.stringify(inputs)).not.toContain("Private");
  });

  it("deletes settled campaign content without deleting its usage history", async () => {
    const providerStarted = deferred<void>();
    const providerResult = deferred<ProviderGenerationResult>();
    const provider = providerAdapter("provider-a", {
      generate() {
        providerStarted.resolve();
        return providerResult.promise;
      },
    });
    await using backend = await openBackend(backendOptions(createDatabasePath(), [provider]));
    const campaign = backend.campaigns.start({
      title: "Disposable campaign",
      composition: [{ kind: narratorPromptKind.key }],
    });
    const operation = await backend.turns.submit({
      threadId: campaign.threadId,
      content: "Begin",
      configuration: {
        model: { providerId: provider.descriptor.id, modelId: "maker/model" },
      },
    });
    await providerStarted.promise;

    expect(() => backend.campaigns.delete(campaign.id)).toThrow(
      "Campaign cannot be deleted while its thread has an active operation.",
    );

    providerResult.resolve({
      text: "The voyage begins.",
      usage: {
        tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 },
      },
    });
    await operation.settlement;
    expect(backend.campaignUsage.get(campaign.id)).toMatchObject({
      attempts: { completed: 1 },
      tokens: { total: 5 },
    });

    expect(backend.campaigns.delete(campaign.id)).toEqual({
      id: campaign.id,
      threadId: campaign.threadId,
    });
    expect(backend.campaigns.get(campaign.id)).toBeNull();
    expect(backend.threads.get(campaign.threadId)).toBeNull();
    expect(backend.campaignUsage.get(campaign.id)).toBeNull();
    expect(backend.usage.getOverview("all-time")).toMatchObject({
      hasHistory: true,
      attempts: { provider: 1, completed: 1 },
      tokens: { total: 5 },
    });
  });

  it("closes provider adapters in reverse acquisition order", async () => {
    const databasePath = createDatabasePath();
    const closed: string[] = [];
    const first = {
      ...providerAdapter("provider-a"),
      async [Symbol.asyncDispose]() {
        closed.push("provider-a");
      },
    };
    const second = {
      ...providerAdapter("provider-b"),
      async [Symbol.asyncDispose]() {
        closed.push("provider-b");
      },
    };
    const backend = await openBackend(backendOptions(databasePath, [first, second]));

    await backend.close();

    expect(closed).toEqual(["provider-b", "provider-a"]);
  });

  it("surfaces a finalization failure when the layer closes", async () => {
    const closeFailure = new Error("Provider close failed.");
    const provider = {
      ...providerAdapter("provider-a"),
      async [Symbol.asyncDispose]() {
        throw closeFailure;
      },
    };
    const backend = await openBackend(backendOptions(createDatabasePath(), [provider]));

    await expect(backend.close()).rejects.toBe(closeFailure);
  });

  it("disposes a provider produced after backend startup was cancelled", async () => {
    const databasePath = createDatabasePath();
    const adapter = deferred<ProviderAdapter>();
    const dispose = vi.fn(async () => undefined);
    const controller = new AbortController();
    let factorySignal: AbortSignal | undefined;
    const options = backendOptions(databasePath);
    const creating = openBackend(
      {
        ...options,
        providers: [
          {
            id: "provider-a",
            storagePaths: [],
            create(signal) {
              factorySignal = signal;
              return adapter.promise;
            },
          },
        ],
      },
      controller.signal,
    );
    const rejected = expect(creating).rejects.toThrow("Startup left.");
    await vi.waitFor(() => expect(factorySignal).toBeInstanceOf(AbortSignal));

    controller.abort(new Error("Startup left."));
    await rejected;
    adapter.resolve({
      ...providerAdapter("provider-a"),
      [Symbol.asyncDispose]: dispose,
    });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
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
            ? ({
                state: "configured" as const,
                revision: "configuration-1",
                keyLabel: "key...123",
              } as const)
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
    const backend = await openBackend(backendOptions(databasePath, [provider]));

    await expect(backend.storage.measureUsage()).resolves.toEqual(
      expect.objectContaining({
        areas: expect.arrayContaining([
          {
            id: "provider:provider-a",
            category: StorageCategory.AppData,
            bytes: 47,
          },
        ]),
      }),
    );
    await backend.storage.deleteArea("provider:provider-a");
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
    const backend = await openBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = await backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      configuration: {
        model: { providerId: provider.descriptor.id, modelId: "maker/model" },
      },
    });
    await providerStarted.promise;

    const closing = backend.close();

    const interrupted = await pending.settlement;
    await closing;

    if (interrupted.outcome !== "failed") {
      throw new Error("Expected the active reply to be interrupted.");
    }

    expect(providerSignal?.aborted).toBe(true);
    expect(interrupted.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );

    const database = openDatabase(databasePath);

    try {
      expect(database.select().from(generationTable).get()).toEqual(
        expect.objectContaining({
          turnId: interrupted.userMessage.turnId,
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
    const backend = await openBackend(backendOptions(databasePath, [provider]));
    const thread = backend.threads.create();
    const pending = await backend.turns.submit({
      threadId: thread.id,
      content: "Hello",
      configuration: {
        model: { providerId: provider.descriptor.id, modelId: "maker/model" },
      },
    });

    const closing = backend.close();
    const interrupted = await pending.settlement;
    await closing;

    expect(generate).not.toHaveBeenCalled();
    expect(interrupted.generation).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    const reopened = await openBackend(backendOptions(databasePath));

    expect(reopened.turns.listForThread({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [interrupted.userMessage],
      generations: [interrupted.generation],
      ...threadPageMetadata([interrupted.userMessage]),
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
      intent: "reply" as const,
      providerId: "provider-a",
      modelId: "maker/model",
      status: "pending" as const,
      startedAt: 102,
    };
    database.insert(generationTable).values(pending).run();
    closeDatabase(database);

    const backend = await openBackend(backendOptions(databasePath));
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

    await expect(openBackend(backendOptions(databasePath, [provider, provider]))).rejects.toThrow(
      'Provider "duplicate-provider" is registered more than once.',
    );
    expect(() => rmSync(databasePath, { force: true })).not.toThrow();
  });
});
