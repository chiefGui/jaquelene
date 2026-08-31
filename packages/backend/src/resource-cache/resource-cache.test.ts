import { describe, expect, it, vi } from "vite-plus/test";
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

function deferred<Value>() {
  return Promise.withResolvers<Value>();
}

function createMemoryStore(overrides: Partial<CacheStore> = {}) {
  const entries = new Map<string, StoredCacheEntry>();
  let revision = 0;
  const store: CacheStore = {
    async read(address) {
      return entries.get(cacheAddressKey(address));
    },
    async write(entry) {
      entries.set(cacheAddressKey(entry), entry);
      revision = Math.max(revision, entry.revision);
    },
    async delete(selector, nextRevision) {
      for (const [key, entry] of entries) {
        if (cacheAddressMatches(entry, selector)) {
          entries.delete(key);
        }
      }

      revision = Math.max(revision, nextRevision);
    },
    async clear(nextRevision) {
      entries.clear();
      revision = Math.max(revision, nextRevision);
    },
    async inspect() {
      return {
        entries: entries.size,
        logicalBytes: [...entries.values()].reduce((total, entry) => total + entry.payloadBytes, 0),
        revision,
      };
    },
    async close() {},
    ...overrides,
  };

  return { entries, store };
}

type TestInput = Readonly<{ key: string }>;
type TestValue = Readonly<{ value: string }>;

function definition(
  load: ResourceDefinition<TestInput, TestValue>["load"],
): ResourceDefinition<TestInput, TestValue> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    namespace: "test-resource",
    address: ({ key }) => ({ namespace: "test-resource", scope: "test", key }),
    codec: {
      version: 1,
      encode: (value) => encoder.encode(JSON.stringify(value)),
      decode: (payload) => JSON.parse(decoder.decode(payload)) as TestValue,
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
    now?: () => number;
    maxHotEntries?: number;
    reportFailure?: (failure: ResourceCacheFailure) => void;
  }> = {},
) {
  const reportFailure = options.reportFailure ?? vi.fn<(failure: ResourceCacheFailure) => void>();
  const cache = await createResourceCache(store, {
    maxHotEntries: options.maxHotEntries ?? 8,
    maxHotBytes: 8_192,
    ...(options.now ? { now: options.now } : {}),
    reportFailure,
  });
  return { cache, reportFailure };
}

describe("resource cache", () => {
  it("hydrates one shared hot entry for concurrent cold callers", async () => {
    const memory = createMemoryStore();
    const resourceDefinition = definition(vi.fn());
    const input = { key: "shared" };
    const address = resourceDefinition.address(input);
    const payload = resourceDefinition.codec.encode({ value: "persisted" }, input);
    memory.entries.set(cacheAddressKey(address), {
      ...address,
      codecVersion: resourceDefinition.codec.version,
      payload,
      payloadBytes: payload.byteLength,
      storedAt: 0,
      discardAt: 1_000,
      revision: 1,
    });
    const read = vi.fn(memory.store.read);
    const { cache } = await testCache({ ...memory.store, read }, { now: () => 0 });
    const resource = cache.define(resourceDefinition);

    const [first, second] = await Promise.all([resource.resolve(input), resource.resolve(input)]);

    expect(read).toHaveBeenCalledOnce();
    expect(resourceDefinition.load).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    await expect(cache.inspect()).resolves.toMatchObject({ hotEntries: 1 });
    await expect(resource.peek(input)).resolves.toEqual(first);
    expect(read).toHaveBeenCalledOnce();
    await cache.close();
  });

  it("deduplicates a cold refresh for every waiter", async () => {
    const pending = deferred<TestValue>();
    const load = vi.fn(() => pending.promise);
    const { store } = createMemoryStore();
    const { cache } = await testCache(store);
    const resource = cache.define(definition(load));
    const first = resource.resolve({ key: "shared" });
    const second = resource.resolve({ key: "shared" });

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
    await cache.close();
  });

  it("bounds retry metadata for absent resources", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Source unavailable."));
    const { store } = createMemoryStore();
    const { cache } = await testCache(store, { maxHotEntries: 2 });
    const resource = cache.define(definition(load));

    for (const key of ["a", "b", "c"]) {
      await expect(resource.resolve({ key })).rejects.toBeInstanceOf(Error);
    }

    await expect(resource.resolve({ key: "c" })).rejects.toBeInstanceOf(Error);
    expect(load).toHaveBeenCalledTimes(3);
    await expect(resource.resolve({ key: "a" })).rejects.toBeInstanceOf(Error);
    expect(load).toHaveBeenCalledTimes(4);
    await cache.close();
  });

  it("cancels one waiter without cancelling the shared refresh", async () => {
    const pending = deferred<TestValue>();
    let loaderSignal: AbortSignal | undefined;
    const { store } = createMemoryStore();
    const { cache } = await testCache(store);
    const resource = cache.define(
      definition((_input, signal) => {
        loaderSignal = signal;
        return pending.promise;
      }),
    );
    const caller = new AbortController();
    const cancelled = resource.resolve({ key: "shared" }, { signal: caller.signal });
    const remaining = resource.resolve({ key: "shared" });

    await vi.waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));
    caller.abort(new Error("Caller left."));
    await expect(cancelled).rejects.toThrow("Caller left.");
    expect(loaderSignal?.aborted).toBe(false);
    pending.resolve({ value: "loaded" });
    await expect(remaining).resolves.toMatchObject({
      availability: { state: "available", value: { value: "loaded" } },
    });
    await cache.close();
  });

  it("serves stale data immediately while one refresh updates it", async () => {
    let currentTime = 0;
    const refresh = deferred<TestValue>();
    const load = vi
      .fn<ResourceDefinition<TestInput, TestValue>["load"]>()
      .mockResolvedValueOnce({ value: "initial" })
      .mockImplementationOnce(() => refresh.promise);
    const { store } = createMemoryStore();
    const { cache } = await testCache(store, { now: () => currentTime });
    const resource = cache.define(definition(load));
    await resource.resolve({ key: "catalog" });
    currentTime = 150;

    const stale = await resource.resolve({ key: "catalog" });
    const secondStale = await resource.resolve({ key: "catalog" });

    expect(stale).toMatchObject({
      availability: {
        state: "available",
        value: { value: "initial" },
        freshness: "stale",
      },
      refresh: { state: "refreshing" },
    });
    expect(secondStale).toEqual(stale);
    expect(load).toHaveBeenCalledTimes(2);

    refresh.resolve({ value: "updated" });
    await vi.waitFor(async () =>
      expect(await resource.peek({ key: "catalog" })).toMatchObject({
        availability: { state: "available", value: { value: "updated" } },
        refresh: { state: "idle" },
      }),
    );
    await cache.close();
  });

  it("prevents an invalidated refresh from committing even when its loader ignores abort", async () => {
    const firstLoad = deferred<TestValue>();
    const load = vi
      .fn<ResourceDefinition<TestInput, TestValue>["load"]>()
      .mockImplementationOnce(() => firstLoad.promise)
      .mockResolvedValueOnce({ value: "current" });
    const { store } = createMemoryStore();
    const { cache } = await testCache(store);
    const resource = cache.define(definition(load));
    const obsolete = resource.resolve({ key: "catalog" });
    const obsoleteResult = expect(obsolete).rejects.toThrow("invalidated");
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());

    await resource.invalidate({ scope: "test" });
    const current = resource.resolve({ key: "catalog" });
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    firstLoad.resolve({ value: "obsolete" });
    await obsoleteResult;

    await expect(current).resolves.toMatchObject({
      availability: { state: "available", value: { value: "current" } },
    });
    expect(load).toHaveBeenCalledTimes(2);
    await cache.close();
  });

  it("prevents an invalidated hydration from restoring persisted data", async () => {
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const memory = createMemoryStore();
    const resourceDefinition = definition(vi.fn());
    const input = { key: "catalog" };
    const address = resourceDefinition.address(input);
    const payload = resourceDefinition.codec.encode({ value: "obsolete" }, input);
    memory.entries.set(cacheAddressKey(address), {
      ...address,
      codecVersion: resourceDefinition.codec.version,
      payload,
      payloadBytes: payload.byteLength,
      storedAt: 0,
      discardAt: 1_000,
      revision: 1,
    });
    const store: CacheStore = {
      ...memory.store,
      async read(readAddress) {
        const stored = await memory.store.read(readAddress);
        readStarted.resolve();
        await releaseRead.promise;
        return stored;
      },
    };
    const { cache } = await testCache(store, { now: () => 0 });
    const resource = cache.define(resourceDefinition);
    const obsolete = resource.peek(input);
    const obsoleteResult = expect(obsolete).rejects.toThrow("invalidated");
    await readStarted.promise;

    await resource.invalidate({ scope: "test" });
    await obsoleteResult;
    releaseRead.resolve();
    await expect(resource.peek(input)).resolves.toMatchObject({
      availability: { state: "absent" },
    });

    expect(resourceDefinition.load).not.toHaveBeenCalled();
    expect(memory.entries.size).toBe(0);
    await cache.close();
  });

  it("deletes a late persisted refresh before invalidation completes", async () => {
    const writeStarted = deferred<void>();
    const releaseWrite = deferred<void>();
    const memory = createMemoryStore();
    const store: CacheStore = {
      ...memory.store,
      async write(entry) {
        writeStarted.resolve();
        await releaseWrite.promise;
        await memory.store.write(entry);
      },
    };
    const { cache } = await testCache(store);
    const resource = cache.define(definition(async () => ({ value: "obsolete" })));
    const obsolete = resource.resolve({ key: "catalog" });
    const obsoleteResult = expect(obsolete).rejects.toThrow("invalidated");
    await writeStarted.promise;

    const invalidation = resource.invalidate({ scope: "test" });
    releaseWrite.resolve();
    await invalidation;
    await obsoleteResult;

    expect(memory.entries.size).toBe(0);
    await expect(resource.peek({ key: "catalog" })).resolves.toMatchObject({
      availability: { state: "absent" },
    });
    await cache.close();
  });

  it("times out without waiting for a loader that ignores abort", async () => {
    const never = deferred<TestValue>();
    let loaderSignal: AbortSignal | undefined;
    const { store } = createMemoryStore();
    const { cache } = await testCache(store);
    const resourceDefinition = definition((_input, signal) => {
      loaderSignal = signal;
      return never.promise;
    });
    const resource = cache.define({
      ...resourceDefinition,
      policy: {
        ...resourceDefinition.policy,
        timeout: 1,
      },
    });

    await expect(resource.resolve({ key: "catalog" })).rejects.toMatchObject({
      cause: { name: "ResourceTimeoutError" },
    });
    expect(loaderSignal?.aborted).toBe(true);
    await expect(cache.close()).resolves.toBeUndefined();
  });

  it("closes without waiting for an active loader that ignores abort", async () => {
    const never = deferred<TestValue>();
    let loaderSignal: AbortSignal | undefined;
    const { store } = createMemoryStore();
    const { cache } = await testCache(store);
    const resource = cache.define(
      definition((_input, signal) => {
        loaderSignal = signal;
        return never.promise;
      }),
    );
    const pending = resource.resolve({ key: "catalog" });
    await vi.waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));

    await expect(cache.close()).resolves.toBeUndefined();
    await expect(pending).rejects.toThrow("closing");
    expect(loaderSignal?.aborted).toBe(true);
  });

  it("drains an active persistence read before closing its store", async () => {
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const memory = createMemoryStore();
    const close = vi.fn(memory.store.close);
    const store: CacheStore = {
      ...memory.store,
      async read(address) {
        readStarted.resolve();
        await releaseRead.promise;
        return memory.store.read(address);
      },
      close,
    };
    const { cache } = await testCache(store);
    const resource = cache.define(definition(vi.fn()));
    const pending = resource.peek({ key: "catalog" });
    const pendingResult = expect(pending).rejects.toThrow("closing");
    await readStarted.promise;

    const closing = cache.close();
    await pendingResult;
    expect(close).not.toHaveBeenCalled();
    releaseRead.resolve();
    await expect(closing).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("shares shutdown completion across concurrent close callers", async () => {
    const closeStarted = deferred<void>();
    const releaseClose = deferred<void>();
    const memory = createMemoryStore();
    const close = vi.fn(async () => {
      closeStarted.resolve();
      await releaseClose.promise;
    });
    const { cache } = await testCache({ ...memory.store, close });

    const first = cache.close();
    const second = cache.close();
    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });
    await closeStarted.promise;

    expect(close).toHaveBeenCalledOnce();
    expect(secondSettled).toBe(false);
    releaseClose.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(secondSettled).toBe(true);
  });

  it("keeps successful source data in bounded memory when persistence fails visibly", async () => {
    const writeFailure = new Error("Disk is read-only.");
    const memory = createMemoryStore();
    const write = vi.fn(memory.store.write).mockRejectedValueOnce(writeFailure);
    const store: CacheStore = {
      ...memory.store,
      async write(entry) {
        return write(entry);
      },
    };
    const { cache, reportFailure } = await testCache(store);
    const resource = cache.define(definition(async () => ({ value: "available" })));

    await expect(resource.resolve({ key: "catalog" })).resolves.toMatchObject({
      availability: {
        state: "available",
        value: { value: "available" },
        persistence: "memory-only",
      },
    });
    await expect(cache.inspect()).resolves.toMatchObject({
      persistence: "degraded",
      hotEntries: 1,
      lastFailure: { operation: "write", error: writeFailure },
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "write", error: writeFailure }),
    );

    await expect(resource.refresh({ key: "catalog" }, { force: true })).resolves.toMatchObject({
      availability: { state: "available", persistence: "durable" },
    });
    await expect(cache.inspect()).resolves.toMatchObject({
      persistence: "durable",
    });
    await cache.close();
  });
});
