import { Cause, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cacheAddressKey,
  cacheAddressMatches,
  type CacheStore,
  type StoredCacheEntry,
} from "./cache-store";
import {
  createResourceCache,
  type ResourceCacheFailure,
  type ResourceDefinition,
} from "./resource-cache";
import { ResourceCacheService } from "./service";

const run = Effect.runPromise;
const fixtures = new Set<() => Promise<void>>();
afterEach(async () => {
  for (const close of fixtures) {
    await close();
  }
});

function createMemoryStore(overrides: Partial<CacheStore> = {}) {
  const entries = new Map<string, StoredCacheEntry>();
  let revision = 0;
  const store: CacheStore = {
    read: (address) => Effect.sync(() => entries.get(cacheAddressKey(address))),
    write: (entry) =>
      Effect.sync(() => {
        entries.set(cacheAddressKey(entry), entry);
        revision = Math.max(revision, entry.revision);
      }),
    delete: (selector, nextRevision) =>
      Effect.sync(() => {
        for (const [key, entry] of entries) {
          if (cacheAddressMatches(entry, selector)) {
            entries.delete(key);
          }
        }
        revision = Math.max(revision, nextRevision);
      }),
    clear: (nextRevision) =>
      Effect.sync(() => {
        entries.clear();
        revision = Math.max(revision, nextRevision);
      }),
    inspect: () =>
      Effect.sync(() => ({
        entries: entries.size,
        logicalBytes: [...entries.values()].reduce((total, entry) => total + entry.payloadBytes, 0),
        revision,
      })),
    ...overrides,
  };
  return { entries, store };
}

type TestInput = Readonly<{ key: string }>;
type TestValue = Readonly<{ value: string }>;
function definition(
  load: ResourceDefinition<TestInput, TestValue>["load"],
): ResourceDefinition<TestInput, TestValue> {
  return {
    namespace: "test-resource",
    address: ({ key }) => ({ namespace: "test-resource", scope: "test", key }),
    codec: {
      version: 1,
      encode: (value) => new TextEncoder().encode(JSON.stringify(value)),
      decode: (payload) => JSON.parse(new TextDecoder().decode(payload)) as TestValue,
    },
    policy: {
      freshFor: 100,
      retainFor: 1_000,
      retryAfter: 50,
      timeout: 5_000,
      maxEntryBytes: 1_024,
    },
    load,
  };
}

async function testCache(
  store: CacheStore,
  options: Readonly<{
    maxHotEntries?: number;
    maxHotBytes?: number;
    release?: Effect.Effect<void>;
    reportFailure?: (failure: ResourceCacheFailure) => void;
  }> = {},
) {
  const reportFailure = options.reportFailure ?? vi.fn<(failure: ResourceCacheFailure) => void>();
  const runtime = ManagedRuntime.make(
    Layer.effect(
      ResourceCacheService,
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => options.release ?? Effect.void);
        return yield* createResourceCache(store, {
          maxHotEntries: options.maxHotEntries ?? 8,
          maxHotBytes: options.maxHotBytes ?? 8_192,
          reportFailure,
        });
      }),
    ).pipe(Layer.provideMerge(TestClock.layer())),
  );
  const close = () => {
    fixtures.delete(close);
    return runtime.dispose();
  };
  fixtures.add(close);
  return {
    cache: await runtime.runPromise(ResourceCacheService),
    reportFailure,
    close,
    advance: (duration: number) => runtime.runPromise(TestClock.adjust(duration)),
  };
}

function persisted(
  resource: ResourceDefinition<TestInput, TestValue>,
  value = "persisted",
): StoredCacheEntry {
  const input = { key: "catalog" };
  const payload = resource.codec.encode({ value }, input);
  return {
    ...resource.address(input),
    codecVersion: resource.codec.version,
    payload,
    payloadBytes: payload.byteLength,
    storedAt: 0,
    discardAt: 1_000,
    revision: 1,
  };
}

function expectInterrupted(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
}

describe("resource cache", () => {
  it("hydrates one shared hot entry for concurrent cold callers", async () => {
    const memory = createMemoryStore();
    const resourceDefinition = definition(vi.fn());
    const stored = persisted(resourceDefinition);
    memory.entries.set(cacheAddressKey(stored), stored);
    const read = vi.fn(memory.store.read);
    const { cache } = await testCache({ ...memory.store, read });
    const resource = cache.define(resourceDefinition);
    const [first, second] = await Promise.all([
      run(resource.resolve({ key: "catalog" })),
      run(resource.resolve({ key: "catalog" })),
    ]);
    expect(read).toHaveBeenCalledOnce();
    expect(resourceDefinition.load).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    await expect(run(cache.inspect())).resolves.toMatchObject({ hotEntries: 1 });
    await expect(run(resource.peek({ key: "catalog" }))).resolves.toEqual(first);
    expect(read).toHaveBeenCalledOnce();
  });

  it("deduplicates a cold refresh for every waiter", async () => {
    const pending = Promise.withResolvers<TestValue>();
    const load = vi.fn(() => Effect.promise(() => pending.promise));
    const { cache } = await testCache(createMemoryStore().store);
    const resource = cache.define(definition(load));
    const first = run(resource.resolve({ key: "shared" }));
    const second = run(resource.resolve({ key: "shared" }));
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    pending.resolve({ value: "loaded" });
    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    expect(firstSnapshot.availability).toMatchObject({
      state: "available",
      value: { value: "loaded" },
      freshness: "fresh",
      persistence: "durable",
    });
    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  it("bounds retry metadata for absent resources", async () => {
    const load = vi.fn(() => Effect.fail(new Error("Source unavailable.")));
    const { cache } = await testCache(createMemoryStore().store, { maxHotEntries: 2 });
    const resource = cache.define(definition(load));
    for (const key of ["a", "b", "c"]) {
      await expect(run(resource.resolve({ key }))).rejects.toBeInstanceOf(Error);
    }
    await expect(run(resource.resolve({ key: "c" }))).rejects.toBeInstanceOf(Error);
    expect(load).toHaveBeenCalledTimes(3);
    await expect(run(resource.resolve({ key: "a" }))).rejects.toBeInstanceOf(Error);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("cancels one waiter without cancelling the shared refresh", async () => {
    const pending = Promise.withResolvers<TestValue>();
    const started = Promise.withResolvers<AbortSignal>();
    const { cache } = await testCache(createMemoryStore().store);
    const resource = cache.define(
      definition(() =>
        Effect.promise((signal) => {
          started.resolve(signal);
          return pending.promise;
        }),
      ),
    );
    const caller = Effect.runFork(resource.resolve({ key: "shared" }));
    const remaining = run(resource.resolve({ key: "shared" }));
    const signal = await started.promise;
    await run(Fiber.interrupt(caller));
    expectInterrupted(await run(Fiber.await(caller)));
    expect(signal.aborted).toBe(false);
    pending.resolve({ value: "loaded" });
    await expect(remaining).resolves.toMatchObject({
      availability: { state: "available", value: { value: "loaded" } },
    });
  });

  it("serves stale data immediately while one refresh updates it", async () => {
    const refresh = Promise.withResolvers<TestValue>();
    const started = Promise.withResolvers<void>();
    const load = vi
      .fn<ResourceDefinition<TestInput, TestValue>["load"]>()
      .mockReturnValueOnce(Effect.succeed({ value: "initial" }))
      .mockReturnValueOnce(
        Effect.promise(() => {
          started.resolve();
          return refresh.promise;
        }),
      );
    const { cache, advance } = await testCache(createMemoryStore().store);
    const resource = cache.define(definition(load));
    await run(resource.resolve({ key: "catalog" }));
    await advance(150);
    const stale = await run(resource.resolve({ key: "catalog" }));
    const second = await run(resource.resolve({ key: "catalog" }));
    expect(stale).toMatchObject({
      availability: { state: "available", value: { value: "initial" }, freshness: "stale" },
      refresh: { state: "refreshing" },
    });
    expect(second).toEqual(stale);
    await started.promise;
    expect(load).toHaveBeenCalledTimes(2);
    refresh.resolve({ value: "updated" });
    await vi.waitFor(async () =>
      expect(await run(resource.peek({ key: "catalog" }))).toMatchObject({
        availability: { state: "available", value: { value: "updated" } },
        refresh: { state: "idle" },
      }),
    );
  });

  it("prevents an invalidated refresh from committing even when its loader ignores interruption", async () => {
    const pending = Promise.withResolvers<TestValue>();
    const load = vi
      .fn<ResourceDefinition<TestInput, TestValue>["load"]>()
      .mockReturnValueOnce(Effect.promise(() => pending.promise))
      .mockReturnValueOnce(Effect.succeed({ value: "current" }));
    const memory = createMemoryStore();
    const { cache } = await testCache(memory.store);
    const resource = cache.define(definition(load));
    const obsolete = Effect.runPromiseExit(resource.resolve({ key: "catalog" }));
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await run(resource.invalidate({ scope: "test" }));
    expectInterrupted(await obsolete);
    pending.resolve({ value: "obsolete" });
    await expect(run(resource.resolve({ key: "catalog" }))).resolves.toMatchObject({
      availability: { value: { value: "current" } },
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("prevents an invalidated hydration from restoring persisted data", async () => {
    const readStarted = Promise.withResolvers<void>();
    const releaseRead = Promise.withResolvers<void>();
    const memory = createMemoryStore();
    const resourceDefinition = definition(vi.fn());
    const stored = persisted(resourceDefinition, "obsolete");
    memory.entries.set(cacheAddressKey(stored), stored);
    const store: CacheStore = {
      ...memory.store,
      read: Effect.fnUntraced(function* (address) {
        const value = yield* memory.store.read(address);
        readStarted.resolve();
        yield* Effect.promise(() => releaseRead.promise);
        return value;
      }),
    };
    const { cache } = await testCache(store);
    const resource = cache.define(resourceDefinition);
    const obsolete = Effect.runPromiseExit(resource.peek({ key: "catalog" }));
    await readStarted.promise;
    await run(resource.invalidate({ scope: "test" }));
    expectInterrupted(await obsolete);
    releaseRead.resolve();
    await expect(run(resource.peek({ key: "catalog" }))).resolves.toMatchObject({
      availability: { state: "absent" },
    });
    expect(resourceDefinition.load).not.toHaveBeenCalled();
    expect(memory.entries.size).toBe(0);
  });

  it("deletes a late persisted refresh before invalidation completes", async () => {
    const writeStarted = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    const memory = createMemoryStore();
    const store: CacheStore = {
      ...memory.store,
      write: Effect.fnUntraced(function* (entry) {
        writeStarted.resolve();
        yield* Effect.promise(() => releaseWrite.promise);
        yield* memory.store.write(entry);
      }),
    };
    const { cache } = await testCache(store);
    const resource = cache.define(definition(() => Effect.succeed({ value: "obsolete" })));
    const obsolete = Effect.runPromiseExit(resource.resolve({ key: "catalog" }));
    await writeStarted.promise;
    const invalidation = run(resource.invalidate({ scope: "test" }));
    releaseWrite.resolve();
    await invalidation;
    expectInterrupted(await obsolete);
    expect(memory.entries.size).toBe(0);
    await expect(run(resource.peek({ key: "catalog" }))).resolves.toMatchObject({
      availability: { state: "absent" },
    });
  });

  it("times out without waiting for a loader that ignores interruption", async () => {
    const never = Promise.withResolvers<TestValue>();
    const started = Promise.withResolvers<AbortSignal>();
    const { cache, advance } = await testCache(createMemoryStore().store);
    const resource = cache.define(
      definition(() =>
        Effect.promise((signal) => {
          started.resolve(signal);
          return never.promise;
        }),
      ),
    );
    const pending = run(resource.resolve({ key: "catalog" }));
    const failure = expect(pending).rejects.toMatchObject({
      _tag: "ResourceUnavailableError",
      cause: { _tag: "TimeoutError" },
    });
    const signal = await started.promise;
    await advance(5_000);
    await failure;
    expect(signal.aborted).toBe(true);
  });

  it("closes without waiting for an active loader that ignores interruption", async () => {
    const never = Promise.withResolvers<TestValue>();
    const started = Promise.withResolvers<AbortSignal>();
    const { cache, close } = await testCache(createMemoryStore().store);
    const resource = cache.define(
      definition(() =>
        Effect.promise((signal) => {
          started.resolve(signal);
          return never.promise;
        }),
      ),
    );
    const pending = Effect.runPromiseExit(resource.resolve({ key: "catalog" }));
    const signal = await started.promise;
    await close();
    expectInterrupted(await pending);
    expect(signal.aborted).toBe(true);
    await expect(run(cache.inspect())).resolves.toMatchObject({
      state: "closed",
      hotEntries: 0,
      refreshes: 0,
    });
    await expect(run(resource.resolve({ key: "catalog" }))).rejects.toThrow("closed");
  });

  it("drains an active persistence read before releasing its store", async () => {
    const started = Promise.withResolvers<void>();
    const releaseRead = Promise.withResolvers<void>();
    const memory = createMemoryStore();
    const released = vi.fn();
    const store: CacheStore = {
      ...memory.store,
      read: Effect.fnUntraced(function* (address) {
        started.resolve();
        yield* Effect.promise(() => releaseRead.promise);
        return yield* memory.store.read(address);
      }),
    };
    const { cache, close } = await testCache(store, { release: Effect.sync(released) });
    const pending = Effect.runPromiseExit(
      cache.define(definition(vi.fn())).peek({ key: "catalog" }),
    );
    await started.promise;
    const closing = close();
    expectInterrupted(await pending);
    expect(released).not.toHaveBeenCalled();
    releaseRead.resolve();
    await closing;
    expect(released).toHaveBeenCalledOnce();
  });

  it("shares scope shutdown completion across concurrent callers", async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const releaseStore = vi.fn(() => {
      started.resolve();
      return release.promise;
    });
    const { close } = await testCache(createMemoryStore().store, {
      release: Effect.promise(releaseStore),
    });
    const first = close();
    const second = close();
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await started.promise;
    expect(releaseStore).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    release.resolve();
    await Promise.all([first, second]);
    expect(settled).toBe(true);
  });

  it("reports current memory usage when shutdown overtakes storage inspection", async () => {
    const started = Promise.withResolvers<void>();
    const releaseInspection = Promise.withResolvers<void>();
    const memory = createMemoryStore();
    const inspect = vi.fn(memory.store.inspect);
    const { cache, close } = await testCache({ ...memory.store, inspect });
    const resource = cache.define(definition(() => Effect.succeed({ value: "cached" })));
    await run(resource.resolve({ key: "catalog" }));
    inspect.mockReturnValueOnce(
      Effect.promise(() => {
        started.resolve();
        return releaseInspection.promise;
      }).pipe(Effect.andThen(memory.store.inspect())),
    );

    const inspection = run(cache.inspect());
    await started.promise;
    const closing = close();
    releaseInspection.resolve();
    await closing;

    await expect(inspection).resolves.toMatchObject({
      state: "closed",
      hotEntries: 0,
      hotBytes: 0,
      refreshes: 0,
    });
  });

  it("keeps successful source data in bounded memory when persistence fails visibly", async () => {
    const failure = new Error("Disk is read-only.");
    const memory = createMemoryStore();
    const write = vi.fn(memory.store.write).mockReturnValueOnce(Effect.fail(failure));
    const { cache, reportFailure } = await testCache({ ...memory.store, write });
    const resource = cache.define(definition(() => Effect.succeed({ value: "available" })));
    await expect(run(resource.resolve({ key: "catalog" }))).resolves.toMatchObject({
      availability: {
        state: "available",
        value: { value: "available" },
        persistence: "memory-only",
      },
    });
    await expect(run(cache.inspect())).resolves.toMatchObject({
      persistence: "degraded",
      hotEntries: 1,
      lastFailure: { operation: "write", error: failure },
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "write", error: failure }),
    );
    await expect(run(resource.refresh({ key: "catalog" }, { force: true }))).resolves.toMatchObject(
      {
        availability: { state: "available", persistence: "durable" },
      },
    );
    await expect(run(cache.inspect())).resolves.toMatchObject({ persistence: "durable" });
  });

  it("bounds hot entries and bytes while keeping evicted values available from storage", async () => {
    const memory = createMemoryStore();
    const load = vi.fn(({ key }: TestInput) => Effect.succeed({ value: key }));
    const { cache } = await testCache(memory.store, { maxHotEntries: 2, maxHotBytes: 32 });
    const resource = cache.define(definition(load));
    for (const key of ["first", "second", "third"]) {
      await run(resource.resolve({ key }));
    }
    const inspection = await run(cache.inspect());
    expect(inspection.hotEntries).toBeLessThanOrEqual(2);
    expect(inspection.hotBytes).toBeLessThanOrEqual(32);
    expect(memory.entries.size).toBe(3);
    await expect(run(resource.resolve({ key: "first" }))).resolves.toMatchObject({
      availability: { value: { value: "first" }, persistence: "durable" },
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("retains stale values during retry delay and allows an explicit forced refresh", async () => {
    const load = vi
      .fn<ResourceDefinition<TestInput, TestValue>["load"]>()
      .mockReturnValueOnce(Effect.succeed({ value: "initial" }))
      .mockReturnValueOnce(Effect.fail(new Error("Source offline.")))
      .mockReturnValueOnce(Effect.succeed({ value: "recovered" }));
    const { cache, advance } = await testCache(createMemoryStore().store);
    const resource = cache.define(definition(load));
    await run(resource.resolve({ key: "catalog" }));
    await advance(150);
    const failed = await run(resource.refresh({ key: "catalog" }));
    expect(failed).toMatchObject({
      availability: { value: { value: "initial" }, freshness: "stale" },
      refresh: { state: "failed", retryAt: 200 },
    });
    await expect(run(resource.resolve({ key: "catalog" }))).resolves.toEqual(failed);
    expect(load).toHaveBeenCalledTimes(2);
    await expect(run(resource.refresh({ key: "catalog" }, { force: true }))).resolves.toMatchObject(
      { availability: { value: { value: "recovered" }, freshness: "fresh" } },
    );
  });

  it("clears active refreshes without allowing their late results to reappear", async () => {
    const pending = Promise.withResolvers<TestValue>();
    const started = Promise.withResolvers<void>();
    const memory = createMemoryStore();
    const { cache } = await testCache(memory.store);
    const resource = cache.define(
      definition(() =>
        Effect.promise(() => {
          started.resolve();
          return pending.promise;
        }),
      ),
    );
    const obsolete = Effect.runPromiseExit(resource.resolve({ key: "catalog" }));
    await started.promise;
    await run(cache.clear);
    expectInterrupted(await obsolete);
    pending.resolve({ value: "obsolete" });
    await expect(run(resource.peek({ key: "catalog" }))).resolves.toMatchObject({
      availability: { state: "absent" },
    });
    expect(memory.entries.size).toBe(0);
  });

  it("reports failed clearing and can recover on the next attempt", async () => {
    const failure = new Error("Storage unavailable.");
    const memory = createMemoryStore();
    const clear = vi.fn(memory.store.clear).mockReturnValueOnce(Effect.fail(failure));
    const { cache } = await testCache({ ...memory.store, clear });
    await expect(run(cache.clear)).rejects.toBe(failure);
    await expect(run(cache.inspect())).resolves.toMatchObject({
      persistence: "degraded",
      lastFailure: { operation: "clear", error: failure },
    });
    await run(cache.clear);
    await expect(run(cache.inspect())).resolves.toMatchObject({ persistence: "durable" });
  });

  it.each(["invalidate", "close", "timeout"] as const)(
    "preserves loader cleanup failures during %s and still releases storage",
    async (operation) => {
      const started = Promise.withResolvers<void>();
      const failure = new Error("Loader cleanup failed.");
      const released = vi.fn();
      const memory = createMemoryStore();
      const { cache, close, advance } = await testCache(memory.store, {
        release: Effect.sync(released),
      });
      const resource = cache.define(
        definition(() =>
          Effect.sync(() => started.resolve()).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Effect.die(failure)),
          ),
        ),
      );
      const pending = Effect.runPromiseExit(resource.resolve({ key: "catalog" }));
      await started.promise;
      if (operation === "invalidate") {
        await expect(run(resource.invalidate())).rejects.toBe(failure);
        expect(memory.entries.size).toBe(0);
        await close();
      } else if (operation === "close") {
        await expect(close()).rejects.toBe(failure);
      } else {
        await advance(5_000);
        await expect(run(resource.peek({ key: "catalog" }))).resolves.toMatchObject({
          refresh: { state: "failed" },
        });
        await close();
      }
      const exit = await pending;
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
      expect(released).toHaveBeenCalledOnce();
    },
  );

  it("settles concurrent cold requests before evicting their entries", async () => {
    const { cache } = await testCache(createMemoryStore().store, { maxHotEntries: 2 });
    const resource = cache.define(definition(({ key }) => Effect.succeed({ value: key })));
    const snapshots = await Promise.all(
      Array.from({ length: 8 }, (_, key) => run(resource.resolve({ key: String(key) }))),
    );
    expect(snapshots).toHaveLength(8);
    expect(snapshots.every((snapshot) => snapshot.availability.state === "available")).toBe(true);
    await expect(run(cache.inspect())).resolves.toMatchObject({ hotEntries: 2, refreshes: 0 });
  });

  it("shares refresh work with a caller reacting to its start notification", async () => {
    const { cache } = await testCache(createMemoryStore().store);
    const load = vi.fn(() => Effect.succeed({ value: "shared" }));
    const resource = cache.define(definition(load));
    let reacting: Fiber.Fiber<unknown, unknown> | undefined;
    const unsubscribe = cache.subscribe(() => {
      if (!reacting) {
        reacting = Effect.runFork(resource.refresh({ key: "catalog" }));
      }
    });
    const first = await run(resource.resolve({ key: "catalog" }));
    unsubscribe();
    expect(reacting).toBeDefined();
    await expect(run(Fiber.join(reacting!))).resolves.toEqual(first);
    expect(load).toHaveBeenCalledOnce();
  });
});
