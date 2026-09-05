import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodePath from "@effect/platform-node/NodePath";
import { PromptOrigin } from "@jaquelene/domain";
import { Context, Deferred, Effect, Layer, Logger, ManagedRuntime, Path } from "effect";
import { FileTreeService } from "#backend/filesystem/file-tree";
import { nodeFileTreeLayer } from "#backend/filesystem/node-file-tree";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { providerAttemptTable } from "#backend/usage/schema";
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
} from "#backend/storage/area";
import type { StorageDeletion, StorageUsage } from "#backend/storage/storage";
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
    providers: providers.map((provider) => {
      let storagePaths: readonly string[] | null = null;
      if (provider.configuration.kind === "api-key") {
        storagePaths = [];
      }
      return {
        id: provider.descriptor.id,
        storagePaths,
        create: Effect.succeed(provider),
      } satisfies ProviderFactory;
    }),
    storageAreas: [],
  };
}

function providerAdapter(id: string, generation?: ProviderGenerationAdapter): ProviderAdapter {
  return {
    descriptor: { id, name: id, brandId: id },
    configuration: { kind: "none" },
    models: {
      list: Effect.succeed([{ id: "maker/model", name: "Model", brandId: "maker" }]),
    },
    generation: generation ?? { generate: () => Effect.succeed({ text: "Unused" }) },
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
  it("shares host storage owners for the runtime lifetime and reacquires them on restart", async () => {
    class HostOwner extends Context.Service<HostOwner, { readonly clear: Effect.Effect<void> }>()(
      "test/BackendHostOwner",
    ) {}
    let acquisitions = 0;
    let releases = 0;
    const deletions: number[] = [];
    const ownerLayer = Layer.effect(
      HostOwner,
      Effect.acquireRelease(
        Effect.sync(() => {
          const instance = ++acquisitions;
          return HostOwner.of({
            clear: Effect.sync(() => {
              deletions.push(instance);
            }),
          });
        }),
        () =>
          Effect.sync(() => {
            releases += 1;
          }),
      ),
    );
    const options: BackendOptions<HostOwner> = {
      ...backendOptions(createDatabasePath()),
      storageAreas: [
        {
          id: "host",
          category: StorageCategory.AppData,
          paths: [],
          delete: HostOwner.use((owner) => owner.clear),
        },
      ],
    };
    const backendLayer = BackendService.layer(options);
    expectTypeOf<Layer.Services<typeof backendLayer>>().toEqualTypeOf<
      HostOwner | FileTreeService | Path.Path
    >();
    const applicationLayer = backendLayer.pipe(
      Layer.provideMerge(ownerLayer),
      Layer.provide(nodeFileTreeLayer),
      Layer.provide(NodePath.layer),
    );

    for (let iteration = 1; iteration <= 2; iteration += 1) {
      const runtime = ManagedRuntime.make(applicationLayer);
      try {
        const backend = await runtime.runPromise(BackendService);
        const owner = await runtime.runPromise(HostOwner);
        expect(acquisitions).toBe(iteration);
        expect(releases).toBe(iteration - 1);
        await runtime.runPromise(backend.storage.deleteArea("host"));
        await runtime.runPromise(owner.clear);
      } finally {
        await runtime.dispose();
      }
      expect(releases).toBe(iteration);
    }
    expect(deletions).toEqual([1, 1, 2, 2]);
  });

  it("rejects cache storage that overlaps authoritative content before opening it", async () => {
    const databasePath = createDatabasePath();
    const options = backendOptions(databasePath);

    await expect(
      openBackend({ ...options, cache: { ...options.cache, path: databasePath } }),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: `Storage path "${databasePath}" is registered more than once.` },
    });
    expect(existsSync(databasePath)).toBe(false);
  });

  it.each(["identity", "category", "paths"])(
    "rejects invalid storage %s before acquiring backend resources",
    async (invalid) => {
      const databasePath = createDatabasePath();
      const options = backendOptions(databasePath);
      const create = vi.fn(() => providerAdapter("provider-a"));
      const storageArea = {
        id: "desktop",
        category: StorageCategory.AppData as StorageCategory,
        paths: [join(databasePath, "..", "desktop.json")],
        delete: Effect.void,
      };
      if (invalid === "identity") {
        storageArea.id = "content";
      }
      if (invalid === "category") {
        storageArea.category = "unknown" as StorageCategory;
      }
      if (invalid === "paths") {
        storageArea.paths = [databasePath];
      }

      await expect(
        openBackend({
          ...options,
          providers: [{ id: "provider-a", storagePaths: null, create: Effect.sync(create) }],
          storageAreas: [storageArea],
        }),
      ).rejects.toMatchObject({ _tag: "StorageConfigurationError" });
      expect(existsSync(databasePath)).toBe(false);
      expect(existsSync(options.cache.path)).toBe(false);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("rejects provider path conflicts before opening databases or creating providers", async () => {
    const databasePath = createDatabasePath();
    const options = backendOptions(databasePath);
    const create = vi.fn(() => providerAdapter("provider-a"));

    await expect(
      openBackend({
        ...options,
        providers: [
          { id: "provider-a", storagePaths: [databasePath], create: Effect.sync(create) },
        ],
      }),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: `Storage path "${databasePath}" is registered more than once.` },
    });
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(options.cache.path)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["api-key", "none"] as const)(
    "disposes providers whose %s capability disagrees with their storage declaration",
    async (kind) => {
      const options = backendOptions(createDatabasePath());
      const dispose = vi.fn();
      let storagePaths: readonly string[] | null = [];
      let configuration: ProviderAdapter["configuration"] = { kind: "none" };
      if (kind === "api-key") {
        storagePaths = null;
        configuration = {
          kind,
          inspect: () => ({ state: "unconfigured" }),
          configure: () => Effect.succeed({ state: "configured", keyLabel: "key...123" }),
          clear: Effect.void,
        };
      }
      await expect(
        openBackend({
          ...options,
          providers: [
            {
              id: "provider-a",
              storagePaths,
              create: Effect.acquireRelease(
                Effect.succeed({ ...providerAdapter("provider-a"), configuration }),
                () => Effect.sync(dispose),
              ),
            },
          ],
        }),
      ).rejects.toThrow(
        'Provider factory "provider-a" storage does not match its configuration capability.',
      );
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it("serves a persisted model catalog without repeating the remote request after restart", async () => {
    const databasePath = createDatabasePath();
    const firstList = vi.fn(() => [
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
          models: { list: Effect.sync(firstList) },
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

    const secondList = vi.fn(() => {
      throw new Error("The remote catalog should not be requested while the snapshot is fresh.");
    });
    const reopened = await openBackend(
      backendOptions(databasePath, [
        {
          ...providerAdapter("provider-a"),
          models: { list: Effect.sync(secondList) },
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
    const list = vi.fn(() => [{ id: "maker/model", name: "Model", brandId: "maker" }]);
    const backend = await openBackend(
      backendOptions(databasePath, [
        {
          ...providerAdapter("provider-a"),
          models: { list: Effect.sync(list) },
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
      generate: () => Effect.succeed({ text: "The voyage begins." }),
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

  it("completes replies and retains their accounting when usage subscribers throw", async () => {
    const providerResult = deferred<ProviderGenerationResult>();
    const provider = providerAdapter("provider-a", {
      generate: () => Effect.promise(() => providerResult.promise),
    });
    const log = vi.fn<Logger.Logger<unknown, void>["log"]>();
    const runtime = ManagedRuntime.make(
      BackendService.layer(backendOptions(createDatabasePath(), [provider])).pipe(
        Layer.provide(nodeFileTreeLayer),
        Layer.provide(NodePath.layer),
        Layer.provide(Logger.layer([Logger.make(log)])),
      ),
    );

    try {
      const backend = await runtime.runPromise(BackendService);
      backend.usage.subscribe(() => {
        throw new Error("Usage view failed.");
      });
      const changed = vi.fn();
      backend.usage.subscribe(changed);
      const campaign = backend.campaigns.start({ title: "Voyage", composition: [] });
      const operation = await backend.turns.submit({
        threadId: campaign.threadId,
        content: "Begin",
        configuration: { model: { providerId: provider.descriptor.id, modelId: "maker/model" } },
      });
      await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
      expect(backend.usage.getOverview("all-time").attempts.pending).toBe(1);
      providerResult.resolve({
        text: "The voyage begins.",
        usage: { tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 } },
      });

      await expect(operation.settlement).resolves.toMatchObject({
        outcome: "completed",
        generation: { status: "completed" },
        assistantMessage: { content: "The voyage begins." },
      });
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
      expect(log).toHaveBeenCalledTimes(2);
      expect(backend.usage.getOverview("all-time")).toMatchObject({
        attempts: { pending: 0, completed: 1 },
        tokens: { total: 5 },
      });
      expect(backend.campaignUsage.get(campaign.id)).toMatchObject({
        attempts: { pending: 0, completed: 1 },
        tokens: { total: 5 },
      });
      expect(backend.usage.clear()).toEqual({ deletedAttempts: 1 });
      await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
      expect(log).toHaveBeenCalledTimes(3);
    } finally {
      await runtime.dispose();
    }
  });

  it("uses an edited narrator prompt on the next turn of an existing campaign", async () => {
    const inputs: ModelInput[] = [];
    const provider = providerAdapter("provider-a", {
      generate: ({ input }) =>
        Effect.sync(() => {
          inputs.push(input);
          return { text: `Reply ${inputs.length}` };
        }),
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
      generate: () =>
        Effect.sync(() => providerStarted.resolve()).pipe(
          Effect.andThen(Effect.promise(() => providerResult.promise)),
        ),
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
    const backend = await openBackend({
      ...backendOptions(databasePath),
      providers: ["provider-a", "provider-b"].map((id) => ({
        id,
        storagePaths: null,
        create: Effect.acquireRelease(Effect.succeed(providerAdapter(id)), () =>
          Effect.sync(() => {
            closed.push(id);
          }),
        ),
      })),
    });

    await backend.close();

    expect(closed).toEqual(["provider-b", "provider-a"]);
  });

  it("surfaces a finalization failure when the layer closes", async () => {
    const closeFailure = new Error("Provider close failed.");
    const backend = await openBackend({
      ...backendOptions(createDatabasePath()),
      providers: [
        {
          id: "provider-a",
          storagePaths: null,
          create: Effect.acquireRelease(Effect.succeed(providerAdapter("provider-a")), () =>
            Effect.die(closeFailure),
          ),
        },
      ],
    });

    await expect(backend.close()).rejects.toBe(closeFailure);
  });

  it("finishes owned acquisition and releases its resource after startup is interrupted", async () => {
    const acquisitionStarted = Deferred.makeUnsafe<void>();
    const releaseAcquisition = Deferred.makeUnsafe<ProviderAdapter>();
    const dispose = vi.fn();
    const controller = new AbortController();
    const creating = openBackend(
      {
        ...backendOptions(createDatabasePath()),
        providers: [
          {
            id: "provider-a",
            storagePaths: null,
            create: Effect.acquireRelease(
              Deferred.succeed(acquisitionStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseAcquisition)),
              ),
              () => Effect.sync(dispose),
            ),
          },
        ],
      },
      controller.signal,
    );
    const rejected = expect(creating).rejects.toThrow("Startup left.");
    await Effect.runPromise(Deferred.await(acquisitionStarted));
    controller.abort(new Error("Startup left."));
    expect(dispose).not.toHaveBeenCalled();
    await Effect.runPromise(Deferred.succeed(releaseAcquisition, providerAdapter("provider-a")));
    await rejected;
    expect(dispose).toHaveBeenCalledOnce();
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
        inspect: () => {
          if (configured) {
            return {
              state: "configured" as const,
              revision: "configuration-1",
              keyLabel: "key...123",
            };
          }
          return { state: "unconfigured" as const };
        },
        configure: () =>
          Effect.sync(() => {
            configured = true;
            return { state: "configured" as const, keyLabel: "key...123" };
          }),
        clear: Effect.sync(() => {
          configured = false;
          rmSync(configurationPath, { force: true });
        }),
      },
    } satisfies ProviderAdapter;
    const backend = await openBackend({
      ...backendOptions(databasePath),
      providers: [
        {
          id: provider.descriptor.id,
          storagePaths: [configurationPath],
          create: Effect.succeed(provider),
        },
      ],
    });

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
    const providerStarted = Deferred.makeUnsafe<void>();
    const providerInterrupted = vi.fn();
    const provider = providerAdapter("provider-a", {
      generate: () =>
        Deferred.succeed(providerStarted, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Effect.sync(providerInterrupted)),
        ),
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
    await Effect.runPromise(Deferred.await(providerStarted));

    const closing = backend.close();
    const interrupted = await pending.settlement;
    await closing;

    if (interrupted.outcome !== "failed") {
      throw new Error("Expected the active reply to be interrupted.");
    }
    expect(providerInterrupted).toHaveBeenCalledOnce();
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
    const generate = vi.fn(() => Effect.succeed({ text: "Too late" }));
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

  it("recovers reply state and all provider attempts before exposing reopened services", async () => {
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
    database
      .insert(providerAttemptTable)
      .values([
        {
          id: ids.providerAttempt.create(),
          executionId: pending.id,
          providerId: "provider-a",
          requestedModelId: "maker/model",
          status: "pending",
          startedAt: 103,
        },
        {
          id: ids.providerAttempt.create(),
          executionId: "independent-execution",
          attributionKind: "document",
          attributionId: "document-1",
          providerId: "provider-a",
          requestedModelId: "maker/model",
          status: "pending",
          startedAt: 104,
        },
      ])
      .run();
    closeDatabase(database);

    const backend = await openBackend(backendOptions(databasePath));
    expect(backend.usage.getOverview("all-time").attempts).toEqual({
      provider: 2,
      pending: 0,
      completed: 0,
      failed: 2,
    });
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
      expect(recoveredDatabase.select().from(providerAttemptTable).all()).toEqual([
        expect.objectContaining({
          executionId: pending.id,
          status: "failed",
          failureKind: "interrupted",
          finishedAt: expect.any(Number),
        }),
        expect.objectContaining({
          executionId: "independent-execution",
          attributionKind: "document",
          attributionId: "document-1",
          status: "failed",
          failureKind: "interrupted",
          finishedAt: expect.any(Number),
        }),
      ]);
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
