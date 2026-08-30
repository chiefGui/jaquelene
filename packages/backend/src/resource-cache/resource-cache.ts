import {
  cacheAddressKey,
  cacheAddressMatches,
  type CacheAddress,
  type CacheSelector,
  type CacheStore,
  type StoredCacheEntry,
} from "./cache-store";

export type ResourceCacheFailure = Readonly<{
  operation:
    | "open"
    | "recover"
    | "decode"
    | "load"
    | "notify"
    | "read"
    | "write"
    | "delete"
    | "clear"
    | "close"
    | "inspect";
  address?: CacheAddress;
  error: unknown;
}>;

export type ResourceCodec<Input, Value> = Readonly<{
  version: number;
  encode: (value: Value, input: Input) => Uint8Array;
  decode: (payload: Uint8Array, input: Input) => Value;
}>;

export type ResourcePolicy = Readonly<{
  freshFor: number;
  retainFor: number;
  retryAfter: number;
  timeout: number;
  maxEntryBytes: number;
}>;

export type ResourceDefinition<Input, Value> = Readonly<{
  namespace: string;
  address: (input: Input) => CacheAddress;
  codec: ResourceCodec<Input, Value>;
  policy: ResourcePolicy;
  load: (input: Input, signal: AbortSignal) => Promise<Value>;
}>;

export type ResourceAvailability<Value> =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "available";
      value: Value;
      freshness: "fresh" | "stale";
      storedAt: number;
      discardAt: number;
      persistence: "durable" | "memory-only";
    }>;

export type ResourceRefresh =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "refreshing"; startedAt: number }>
  | Readonly<{
      state: "failed";
      failedAt: number;
      retryAt: number;
      failureKind: "source" | "timeout";
    }>;

export type ResourceSnapshot<Value> = Readonly<{
  revision: number;
  availability: ResourceAvailability<Value>;
  refresh: ResourceRefresh;
}>;

export type ResourceCacheEvent = Readonly<{
  address: CacheAddress;
  revision: number;
}>;

export type ResourceCacheInspection = Readonly<{
  state: "open" | "closed";
  persistence: "durable" | "degraded";
  hotEntries: number;
  hotBytes: number;
  refreshes: number;
  revision: number;
  store?: Readonly<{
    entries: number;
    logicalBytes: number;
  }>;
  lastFailure?: ResourceCacheFailure;
}>;

export type ResourceCacheOptions = Readonly<{
  maxHotEntries: number;
  maxHotBytes: number;
  now?: () => number;
  reportFailure: (failure: ResourceCacheFailure) => void;
}>;

type RuntimeEntry<Input = unknown, Value = unknown> = {
  address: CacheAddress;
  definition: ResourceDefinition<Input, Value>;
  input: Input;
  revision: number;
  generation: number;
  value?: Value;
  payloadBytes: number;
  storedAt?: number;
  discardAt?: number;
  persistence?: "durable" | "memory-only";
  refresh: ResourceRefresh;
  failure?: unknown;
};

type RefreshFlight<Value> = Readonly<{
  address: CacheAddress;
  controller: AbortController;
  result: Promise<ResourceSnapshot<Value>>;
}>;

type PersistenceOperation = "read" | "write" | "delete" | "clear" | "inspect";

export type CachedResource<Input, Value> = Readonly<{
  resolve: (
    input: Input,
    options?: Readonly<{ signal?: AbortSignal }>,
  ) => Promise<ResourceSnapshot<Value>>;
  refresh: (
    input: Input,
    options?: Readonly<{ signal?: AbortSignal; force?: boolean }>,
  ) => Promise<ResourceSnapshot<Value>>;
  peek: (input: Input) => Promise<ResourceSnapshot<Value>>;
  invalidate: (selector?: Readonly<{ scope?: string; key?: string }>) => Promise<void>;
}>;

export type ResourceCache = Readonly<{
  define: <Input, Value>(
    definition: ResourceDefinition<Input, Value>,
  ) => CachedResource<Input, Value>;
  subscribe: (listener: (event: ResourceCacheEvent) => void) => () => void;
  invalidate: (selector: CacheSelector) => Promise<void>;
  clear: () => Promise<void>;
  inspect: (selector?: CacheSelector) => Promise<ResourceCacheInspection>;
  close: () => Promise<void>;
}>;

class ResourceTimeoutError extends Error {
  override readonly name = "ResourceTimeoutError";
}

export class ResourceUnavailableError extends Error {
  override readonly name = "ResourceUnavailableError";

  constructor(address: CacheAddress, cause: unknown) {
    super(`Resource ${cacheAddressKey(address)} is unavailable.`, { cause });
  }
}

function requireFiniteDuration(value: number, name: string, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new RangeError(`${name} must be a ${allowZero ? "non-negative" : "positive"} duration.`);
  }
}

function requireDefinition<Input, Value>(definition: ResourceDefinition<Input, Value>) {
  if (!definition.namespace.trim() || definition.namespace.length > 128) {
    throw new TypeError("A cached resource requires a namespace.");
  }

  if (!Number.isSafeInteger(definition.codec.version) || definition.codec.version < 1) {
    throw new RangeError("A cached resource codec requires a positive integer version.");
  }

  requireFiniteDuration(definition.policy.freshFor, "Resource freshness");
  requireFiniteDuration(definition.policy.retainFor, "Resource retention", false);
  requireFiniteDuration(definition.policy.retryAfter, "Resource retry delay");
  requireFiniteDuration(definition.policy.timeout, "Resource timeout", false);

  if (
    !Number.isSafeInteger(definition.policy.maxEntryBytes) ||
    definition.policy.maxEntryBytes < 1
  ) {
    throw new RangeError("A cached resource requires a positive maximum entry size.");
  }

  if (definition.policy.retainFor < definition.policy.freshFor) {
    throw new RangeError("Resource retention cannot be shorter than its freshness window.");
  }
}

function requireAddress(address: CacheAddress, namespace: string) {
  if (
    address.namespace !== namespace ||
    !address.namespace.trim() ||
    !address.scope.trim() ||
    !address.key.trim() ||
    address.scope.length > 512 ||
    address.key.length > 512
  ) {
    throw new TypeError(`Cached resource "${namespace}" produced an invalid address.`);
  }

  return address;
}

function requireSelector(selector: CacheSelector) {
  for (const [name, value] of Object.entries(selector)) {
    if (value !== undefined && (!value.trim() || value.length > 512)) {
      throw new TypeError(`Cached resource selector ${name} is invalid.`);
    }
  }

  return selector;
}

function storedEntryIsValid<Input, Value>(
  entry: StoredCacheEntry,
  definition: ResourceDefinition<Input, Value>,
) {
  return (
    Number.isSafeInteger(entry.payloadBytes) &&
    entry.payloadBytes === entry.payload.byteLength &&
    entry.payloadBytes <= definition.policy.maxEntryBytes &&
    Number.isSafeInteger(entry.storedAt) &&
    entry.storedAt >= 0 &&
    Number.isSafeInteger(entry.discardAt) &&
    entry.discardAt > entry.storedAt &&
    Number.isSafeInteger(entry.revision) &&
    entry.revision >= 0
  );
}

function interruption(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Cached resource operation was interrupted.", { cause: signal.reason });
}

function waitForCaller<Value>(result: Promise<Value>, signal?: AbortSignal) {
  if (!signal) {
    return result;
  }

  if (signal.aborted) {
    return Promise.reject(interruption(signal));
  }

  let removeListener: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(interruption(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interrupted]).finally(removeListener);
}

function snapshot<Input, Value>(
  entry: RuntimeEntry<Input, Value>,
  now: number,
): ResourceSnapshot<Value> {
  const availability: ResourceAvailability<Value> =
    entry.value === undefined || entry.storedAt === undefined || entry.discardAt === undefined
      ? { state: "absent" }
      : {
          state: "available",
          value: entry.value,
          freshness: now < entry.storedAt + entry.definition.policy.freshFor ? "fresh" : "stale",
          storedAt: entry.storedAt,
          discardAt: entry.discardAt,
          persistence: entry.persistence ?? "memory-only",
        };

  return {
    revision: entry.revision,
    availability,
    refresh: entry.refresh,
  };
}

export async function createResourceCache(
  store: CacheStore,
  options: ResourceCacheOptions,
): Promise<ResourceCache> {
  if (!Number.isSafeInteger(options.maxHotEntries) || options.maxHotEntries < 1) {
    throw new RangeError("The resource cache requires a positive hot-entry limit.");
  }

  if (!Number.isSafeInteger(options.maxHotBytes) || options.maxHotBytes < 1) {
    throw new RangeError("The resource cache requires a positive hot-byte limit.");
  }

  const now = options.now ?? Date.now;
  const namespaces = new Set<string>();
  const entries = new Map<string, RuntimeEntry<any, any>>();
  const flights = new Map<string, RefreshFlight<unknown>>();
  const listeners = new Set<(event: ResourceCacheEvent) => void>();
  let state: "open" | "closed" = "open";
  let persistence: "durable" | "degraded" = "durable";
  const persistenceFailures = new Set<PersistenceOperation>();
  let lastFailure: ResourceCacheFailure | undefined;
  let globalGeneration = 0;
  let revision: number;

  try {
    revision = (await store.inspect()).revision;
  } catch (error) {
    revision = 0;
    persistenceFailed("inspect", { operation: "inspect", error });
  }

  function assertOpen() {
    if (state !== "open") {
      throw new Error("Resource cache is closed.");
    }
  }

  function report(failure: ResourceCacheFailure) {
    lastFailure = failure;

    try {
      options.reportFailure(failure);
    } catch (error) {
      lastFailure = {
        operation: "notify",
        error: new AggregateError(
          [failure.error, error],
          "A resource cache failure and its reporter both failed.",
        ),
      };
    }
  }

  function persistenceFailed(operation: PersistenceOperation, failure: ResourceCacheFailure) {
    persistenceFailures.add(operation);
    persistence = "degraded";
    report(failure);
  }

  function persistenceRecovered(operation: PersistenceOperation) {
    persistenceFailures.delete(operation);

    if (persistenceFailures.size === 0) {
      persistence = "durable";
    }
  }

  function nextRevision() {
    revision += 1;
    return revision;
  }

  function announce<Input, Value>(entry: RuntimeEntry<Input, Value>) {
    const event = { address: entry.address, revision: entry.revision } satisfies ResourceCacheEvent;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        report({ operation: "notify", address: entry.address, error });
      }
    }
  }

  function touch<Input, Value>(entry: RuntimeEntry<Input, Value>) {
    entries.delete(cacheAddressKey(entry.address));
    entries.set(cacheAddressKey(entry.address), entry);
  }

  function trimHotEntries(protectedKey?: string) {
    let hotEntries = 0;
    let hotBytes = 0;

    for (const entry of entries.values()) {
      if (entry.value !== undefined) {
        hotEntries += 1;
        hotBytes += entry.payloadBytes;
      }
    }

    if (hotEntries <= options.maxHotEntries && hotBytes <= options.maxHotBytes) {
      return;
    }

    for (const [entryKey, entry] of entries) {
      if (entryKey === protectedKey || entry.value === undefined || flights.has(entryKey)) {
        continue;
      }

      hotEntries -= 1;
      hotBytes -= entry.payloadBytes;
      entry.value = undefined;
      entry.payloadBytes = 0;
      delete entry.storedAt;
      delete entry.discardAt;
      delete entry.persistence;

      if (entry.refresh.state === "idle") {
        entries.delete(entryKey);
      }

      if (hotEntries <= options.maxHotEntries && hotBytes <= options.maxHotBytes) {
        break;
      }
    }
  }

  async function deletePersisted(selector: CacheSelector, deletionRevision: number) {
    try {
      await store.delete(selector, deletionRevision);
      persistenceRecovered("delete");
    } catch (error) {
      persistenceFailed("delete", { operation: "delete", error });
    }
  }

  async function loadStored<Input, Value>(
    definition: ResourceDefinition<Input, Value>,
    input: Input,
    address: CacheAddress,
  ) {
    const entryKey = cacheAddressKey(address);
    const existing = entries.get(entryKey) as RuntimeEntry<Input, Value> | undefined;

    if (existing?.value !== undefined) {
      if (existing.discardAt !== undefined && existing.discardAt <= now()) {
        const deletionRevision = nextRevision();
        existing.revision = deletionRevision;
        delete existing.value;
        existing.payloadBytes = 0;
        delete existing.storedAt;
        delete existing.discardAt;
        delete existing.persistence;
        await deletePersisted(address, deletionRevision);
        announce(existing);
      } else {
        touch(existing);
        return existing;
      }
    }

    let stored;

    try {
      stored = await store.read(address);
      persistenceRecovered("read");
    } catch (error) {
      persistenceFailed("read", { operation: "read", address, error });
    }

    const entry =
      existing ??
      ({
        address,
        definition,
        input,
        revision: stored?.revision ?? revision,
        generation: 0,
        payloadBytes: 0,
        refresh: { state: "idle" },
      } satisfies RuntimeEntry<Input, Value>);
    entries.set(entryKey, entry);

    if (!stored) {
      return entry;
    }

    revision = Math.max(revision, stored.revision);
    entry.revision = stored.revision;

    if (
      stored.codecVersion !== definition.codec.version ||
      !storedEntryIsValid(stored, definition) ||
      stored.discardAt <= now()
    ) {
      const deletionRevision = nextRevision();
      entry.revision = deletionRevision;
      if (
        stored.codecVersion === definition.codec.version &&
        !storedEntryIsValid(stored, definition)
      ) {
        report({
          operation: "decode",
          address,
          error: new TypeError("A persisted cached resource entry is invalid."),
        });
      }
      await deletePersisted(address, deletionRevision);
      return entry;
    }

    try {
      entry.value = definition.codec.decode(stored.payload, input);
      entry.payloadBytes = stored.payloadBytes;
      entry.storedAt = stored.storedAt;
      entry.discardAt = stored.discardAt;
      entry.persistence = "durable";
      touch(entry);
      trimHotEntries(entryKey);
    } catch (error) {
      const deletionRevision = nextRevision();
      entry.revision = deletionRevision;
      report({ operation: "decode", address, error });
      await deletePersisted(address, deletionRevision);
    }

    return entry;
  }

  function startRefresh<Input, Value>(
    entry: RuntimeEntry<Input, Value>,
    force: boolean,
  ): Promise<ResourceSnapshot<Value>> | undefined {
    const entryKey = cacheAddressKey(entry.address);
    const currentFlight = flights.get(entryKey) as RefreshFlight<Value> | undefined;

    if (currentFlight) {
      return currentFlight.result;
    }

    const startedAt = now();

    if (!force && entry.refresh.state === "failed" && startedAt < entry.refresh.retryAt) {
      return undefined;
    }

    const controller = new AbortController();
    const capturedGlobalGeneration = globalGeneration;
    const capturedEntryGeneration = entry.generation;
    entry.refresh = { state: "refreshing", startedAt };
    entry.revision = nextRevision();
    announce(entry);

    const timeoutError = new ResourceTimeoutError(
      `Resource ${cacheAddressKey(entry.address)} exceeded its refresh timeout.`,
    );
    const timeout = setTimeout(
      () => controller.abort(timeoutError),
      entry.definition.policy.timeout,
    );
    const load = Promise.resolve().then(() =>
      entry.definition.load(entry.input, controller.signal),
    );
    const result = waitForCaller(load, controller.signal)
      .then(async (loaded) => {
        controller.signal.throwIfAborted();
        const payload = entry.definition.codec.encode(loaded, entry.input);

        if (!(payload instanceof Uint8Array)) {
          throw new TypeError("A cached resource codec must encode to a byte array.");
        }

        if (payload.byteLength > entry.definition.policy.maxEntryBytes) {
          throw new RangeError(
            `Resource ${cacheAddressKey(entry.address)} exceeds its maximum entry size.`,
          );
        }

        const value = entry.definition.codec.decode(payload, entry.input);

        if (value === undefined) {
          throw new TypeError("A cached resource codec cannot decode to undefined.");
        }

        if (
          state !== "open" ||
          capturedGlobalGeneration !== globalGeneration ||
          capturedEntryGeneration !== entry.generation
        ) {
          throw interruption(controller.signal);
        }

        const storedAt = now();
        const successRevision = nextRevision();
        entry.value = value;
        entry.payloadBytes = payload.byteLength;
        entry.storedAt = storedAt;
        entry.discardAt = storedAt + entry.definition.policy.retainFor;
        entry.persistence = "durable";
        entry.refresh = { state: "idle" };
        delete entry.failure;
        entry.revision = successRevision;
        touch(entry);

        try {
          await store.write({
            ...entry.address,
            codecVersion: entry.definition.codec.version,
            payload,
            payloadBytes: payload.byteLength,
            storedAt,
            discardAt: entry.discardAt,
            revision: successRevision,
          });
          persistenceRecovered("write");
        } catch (error) {
          entry.persistence = "memory-only";
          persistenceFailed("write", { operation: "write", address: entry.address, error });
        }

        announce(entry);
        trimHotEntries(entryKey);
        return snapshot(entry, now());
      })
      .catch((error: unknown) => {
        const invalidated =
          state !== "open" ||
          capturedGlobalGeneration !== globalGeneration ||
          capturedEntryGeneration !== entry.generation;

        if (invalidated) {
          throw error;
        }

        const failedAt = now();
        const failureKind = error instanceof ResourceTimeoutError ? "timeout" : "source";
        entry.refresh = {
          state: "failed",
          failedAt,
          retryAt: failedAt + entry.definition.policy.retryAfter,
          failureKind,
        };
        entry.failure = error;
        entry.revision = nextRevision();
        report({ operation: "load", address: entry.address, error });
        announce(entry);

        if (entry.value !== undefined) {
          return snapshot(entry, failedAt);
        }

        throw new ResourceUnavailableError(entry.address, error);
      })
      .finally(() => {
        clearTimeout(timeout);

        if (flights.get(entryKey)?.controller === controller) {
          flights.delete(entryKey);
        }
      });

    flights.set(entryKey, { address: entry.address, controller, result });
    return result;
  }

  async function invalidate(selector: CacheSelector) {
    assertOpen();
    requireSelector(selector);
    const invalidationRevision = nextRevision();

    for (const [entryKey, entry] of entries) {
      if (!cacheAddressMatches(entry.address, selector)) {
        continue;
      }

      entry.generation += 1;
      entry.revision = invalidationRevision;
      flights.get(entryKey)?.controller.abort(new Error("Cached resource was invalidated."));
      flights.delete(entryKey);
      announce(entry);
      entries.delete(entryKey);
    }

    await deletePersisted(selector, invalidationRevision);
  }

  return {
    define<Input, Value>(definition: ResourceDefinition<Input, Value>) {
      assertOpen();
      requireDefinition(definition);

      if (namespaces.has(definition.namespace)) {
        throw new Error(`Cached resource namespace "${definition.namespace}" is already defined.`);
      }

      namespaces.add(definition.namespace);

      async function getEntry(input: Input) {
        assertOpen();
        const address = requireAddress(definition.address(input), definition.namespace);
        return loadStored(definition, input, address);
      }

      const resource: CachedResource<Input, Value> = {
        async resolve(input, resolveOptions) {
          const entry = await getEntry(input);
          const current = snapshot(entry, now());

          if (current.availability.state === "available") {
            if (current.availability.freshness === "stale") {
              void startRefresh(entry, false)?.catch(() => undefined);
              return snapshot(entry, now());
            }

            return current;
          }

          const refresh = startRefresh(entry, false);

          if (!refresh) {
            throw new ResourceUnavailableError(entry.address, entry.failure);
          }

          return waitForCaller(refresh, resolveOptions?.signal);
        },

        async refresh(input, refreshOptions) {
          const entry = await getEntry(input);
          const refresh = startRefresh(entry, refreshOptions?.force ?? false);

          if (!refresh) {
            const current = snapshot(entry, now());

            if (current.availability.state === "available") {
              return current;
            }

            throw new ResourceUnavailableError(entry.address, entry.failure);
          }

          return waitForCaller(refresh, refreshOptions?.signal);
        },

        async peek(input) {
          return snapshot(await getEntry(input), now());
        },

        invalidate(selector = {}) {
          return invalidate({ namespace: definition.namespace, ...selector });
        },
      };

      return resource;
    },

    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    invalidate,

    async clear() {
      assertOpen();
      globalGeneration += 1;
      const clearRevision = nextRevision();
      const clearedEntries = [...entries.values()];

      for (const flight of flights.values()) {
        flight.controller.abort(new Error("Resource cache was cleared."));
      }

      flights.clear();
      entries.clear();

      try {
        await store.clear(clearRevision);
        persistenceRecovered("clear");
      } catch (error) {
        persistenceFailed("clear", { operation: "clear", error });
        throw error;
      }

      for (const entry of clearedEntries) {
        entry.revision = clearRevision;
        announce(entry);
      }
    },

    async inspect(selector) {
      let hotEntries = 0;
      let hotBytes = 0;

      for (const entry of entries.values()) {
        if (
          (!selector || cacheAddressMatches(entry.address, selector)) &&
          entry.value !== undefined
        ) {
          hotEntries += 1;
          hotBytes += entry.payloadBytes;
        }
      }

      let storeInspection;

      if (state === "open") {
        try {
          storeInspection = await store.inspect(selector);
          persistenceRecovered("inspect");
        } catch (error) {
          persistenceFailed("inspect", { operation: "inspect", error });
        }
      }

      return {
        state,
        persistence,
        hotEntries,
        hotBytes,
        refreshes: [...flights.values()].filter(
          ({ address }) => !selector || cacheAddressMatches(address, selector),
        ).length,
        revision,
        ...(storeInspection
          ? {
              store: {
                entries: storeInspection.entries,
                logicalBytes: storeInspection.logicalBytes,
              },
            }
          : {}),
        ...(lastFailure ? { lastFailure } : {}),
      } satisfies ResourceCacheInspection;
    },

    async close() {
      if (state === "closed") {
        return;
      }

      state = "closed";
      globalGeneration += 1;

      for (const flight of flights.values()) {
        flight.controller.abort(new Error("Resource cache is closing."));
      }

      await Promise.allSettled([...flights.values()].map(({ result }) => result));
      flights.clear();
      entries.clear();
      listeners.clear();
      try {
        await store.close();
      } catch (error) {
        report({ operation: "close", error });
        throw error;
      }
    },
  };
}
