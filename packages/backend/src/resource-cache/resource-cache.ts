import {
  Cause,
  Clock,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  FiberSet,
  Option,
  Predicate,
  Queue,
  Schema,
  type Scope,
} from "effect";
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
  load: (input: Input) => Effect.Effect<Value, unknown>;
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
  reportFailure: (failure: ResourceCacheFailure) => void;
}>;

type RuntimeEntry<Input = unknown, Value = unknown> = {
  address: CacheAddress;
  definition: ResourceDefinition<Input, Value>;
  input: Input;
  revision: number;
  value?: Value;
  payloadBytes: number;
  storedAt?: number;
  discardAt?: number;
  persistence?: "durable" | "memory-only";
  refresh: ResourceRefresh;
  failure?: unknown;
};

type PersistenceOperation = "read" | "write" | "delete" | "clear" | "inspect";

export type CachedResource<Input, Value> = Readonly<{
  resolve: (input: Input) => Effect.Effect<ResourceSnapshot<Value>, unknown>;
  refresh: (
    input: Input,
    options?: Readonly<{ force?: boolean }>,
  ) => Effect.Effect<ResourceSnapshot<Value>, unknown>;
  peek: (input: Input) => Effect.Effect<ResourceSnapshot<Value>, unknown>;
  invalidate: (
    selector?: Readonly<{ scope?: string; key?: string }>,
  ) => Effect.Effect<void, unknown>;
}>;

export type ResourceCache = Readonly<{
  define: <Input, Value>(
    definition: ResourceDefinition<Input, Value>,
  ) => CachedResource<Input, Value>;
  subscribe: (listener: (event: ResourceCacheEvent) => void) => () => void;
  invalidate: (selector: CacheSelector) => Effect.Effect<void, unknown>;
  clear: Effect.Effect<void, unknown>;
  inspect: (selector?: CacheSelector) => Effect.Effect<ResourceCacheInspection, unknown>;
}>;

export class ResourceUnavailableError extends Schema.TaggedError<ResourceUnavailableError>()(
  "ResourceUnavailableError",
  {
    address: Schema.Struct({ namespace: Schema.String, scope: Schema.String, key: Schema.String }),
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Resource ${cacheAddressKey(this.address)} is unavailable.`;
  }
}

function requireFiniteDuration(value: number, name: string, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    if (allowZero) {
      throw new RangeError(`${name} must be a non-negative duration.`);
    }
    throw new RangeError(`${name} must be a positive duration.`);
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

function snapshot<Input, Value>(
  entry: RuntimeEntry<Input, Value>,
  now: number,
): ResourceSnapshot<Value> {
  let availability: ResourceAvailability<Value> = { state: "absent" };
  if (entry.value !== undefined && entry.storedAt !== undefined && entry.discardAt !== undefined) {
    let freshness: "fresh" | "stale" = "stale";
    if (now < entry.storedAt + entry.definition.policy.freshFor) {
      freshness = "fresh";
    }
    availability = {
      state: "available",
      value: entry.value,
      freshness,
      storedAt: entry.storedAt,
      discardAt: entry.discardAt,
      persistence: entry.persistence ?? "memory-only",
    };
  }
  return { revision: entry.revision, availability, refresh: entry.refresh };
}

const interruptJobs = Effect.fnUntraced(function* (
  fibers: readonly Fiber.Fiber<unknown, unknown>[],
) {
  yield* Fiber.interruptAll(fibers);
  const exits = yield* Effect.forEach(fibers, Fiber.await);
  const reasons = exits.flatMap((exit) => {
    if (Exit.isSuccess(exit)) {
      return [];
    }
    return exit.cause.reasons.filter((reason) => !Cause.isInterruptReason(reason));
  });
  if (reasons.length > 0) {
    return yield* Effect.failCause(Cause.fromReasons(reasons));
  }
});

export const createResourceCache = Effect.fn("ResourceCache.make")(function* (
  store: CacheStore,
  options: ResourceCacheOptions,
): Effect.fn.Return<ResourceCache, unknown, Scope.Scope> {
  if (!Number.isSafeInteger(options.maxHotEntries) || options.maxHotEntries < 1) {
    throw new RangeError("The resource cache requires a positive hot-entry limit.");
  }
  if (!Number.isSafeInteger(options.maxHotBytes) || options.maxHotBytes < 1) {
    throw new RangeError("The resource cache requires a positive hot-byte limit.");
  }

  const clock = yield* Clock.Clock;
  const context = yield* Effect.context<never>();
  const now = () => clock.currentTimeMillisUnsafe();
  const namespaces = new Set<string>();
  const entries = new Map<string, RuntimeEntry<any, any>>();
  const hydrations = yield* FiberMap.make<
    RuntimeEntry<any, any>,
    RuntimeEntry<any, any>,
    unknown
  >();
  const refreshes = yield* FiberMap.make<
    RuntimeEntry<any, any>,
    ResourceSnapshot<unknown>,
    unknown
  >();
  const reads = yield* FiberSet.make<unknown, unknown>();
  const mutations = yield* Effect.acquireRelease(
    Queue.unbounded<Effect.Effect<void>>(),
    Queue.shutdown,
  );
  yield* Effect.forever(Effect.flatMap(Queue.take(mutations), (operation) => operation)).pipe(
    Effect.forkScoped,
  );
  const listeners = new Set<(event: ResourceCacheEvent) => void>();
  const persistenceFailures = new Set<PersistenceOperation>();
  let state: "open" | "closed" = "open";
  let lastFailure: ResourceCacheFailure | undefined;
  let revision = 0;
  let latestMutation: Effect.Effect<void> = Effect.void;

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
    report(failure);
  }

  function persistenceRecovered(operation: PersistenceOperation) {
    persistenceFailures.delete(operation);
  }

  function nextRevision() {
    revision += 1;
    return revision;
  }

  function announce(entry: RuntimeEntry<any, any>) {
    const event = { address: entry.address, revision: entry.revision };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        report({ operation: "notify", address: entry.address, error });
      }
    }
  }

  function touch(entry: RuntimeEntry<any, any>) {
    const key = cacheAddressKey(entry.address);
    entries.delete(key);
    entries.set(key, entry);
  }

  function trimEntries(protectedEntry?: RuntimeEntry<any, any>) {
    let hotEntries = 0;
    let hotBytes = 0;
    for (const entry of entries.values()) {
      if (entry.value !== undefined) {
        hotEntries += 1;
        hotBytes += entry.payloadBytes;
      }
    }
    for (const [key, entry] of entries) {
      if (hotEntries <= options.maxHotEntries && hotBytes <= options.maxHotBytes) {
        break;
      }
      if (
        entry === protectedEntry ||
        entry.value === undefined ||
        FiberMap.hasUnsafe(refreshes, entry)
      ) {
        continue;
      }
      hotEntries -= 1;
      hotBytes -= entry.payloadBytes;
      delete entry.value;
      entry.payloadBytes = 0;
      delete entry.storedAt;
      delete entry.discardAt;
      delete entry.persistence;
      if (entry.refresh.state === "idle") {
        entries.delete(key);
      }
    }
    for (const [key, entry] of entries) {
      if (entries.size <= options.maxHotEntries) {
        break;
      }
      if (
        entry === protectedEntry ||
        FiberMap.hasUnsafe(refreshes, entry) ||
        FiberMap.hasUnsafe(hydrations, entry)
      ) {
        continue;
      }
      entries.delete(key);
    }
  }

  const requireCurrent = Effect.fnUntraced(function* (entry: RuntimeEntry<any, any>) {
    if (state !== "open" || entries.get(cacheAddressKey(entry.address)) !== entry) {
      return yield* Effect.interrupt;
    }
  });

  // Mutations enter one FIFO queue. Reads wait for writes already admitted, but
  // do not block invalidation; their lifetime is still drained before SQLite closes.
  const enqueueMutation = Effect.fnUntraced(function* <Value>(
    operation: Effect.Effect<Value, unknown>,
  ) {
    const result = Deferred.makeUnsafe<Value, unknown>();
    latestMutation = Deferred.await(result).pipe(Effect.exit, Effect.asVoid);
    yield* Queue.offer(
      mutations,
      operation.pipe(
        Effect.provideContext(context),
        Effect.exit,
        Effect.flatMap((exit) => Deferred.done(result, exit)),
        Effect.asVoid,
        Effect.uninterruptible,
      ),
    );
    return Deferred.await(result);
  });

  const mutate = Effect.fnUntraced(function* <Value>(operation: Effect.Effect<Value, unknown>) {
    const result = yield* enqueueMutation(operation);
    return yield* result;
  }, Effect.uninterruptible);

  const read = Effect.fnUntraced(function* <Value>(operation: Effect.Effect<Value, unknown>) {
    const fiber = yield* FiberSet.run(
      reads,
      latestMutation.pipe(
        Effect.andThen(operation),
        Effect.provideContext(context),
        Effect.uninterruptible,
      ),
    );
    return yield* Fiber.join(fiber);
  });

  const deletePersisted = (selector: CacheSelector, deletionRevision: number) =>
    store.delete(selector, deletionRevision).pipe(
      Effect.tap(() => Effect.sync(() => persistenceRecovered("delete"))),
      Effect.catch((error) =>
        Effect.sync(() => persistenceFailed("delete", { operation: "delete", error })),
      ),
    );

  const loadStored = Effect.fnUntraced(function* <Input, Value>(entry: RuntimeEntry<Input, Value>) {
    const { address, definition, input } = entry;
    yield* requireCurrent(entry);
    if (entry.value !== undefined) {
      delete entry.value;
      entry.payloadBytes = 0;
      delete entry.storedAt;
      delete entry.discardAt;
      delete entry.persistence;
      entry.revision = nextRevision();
      yield* mutate(deletePersisted(address, entry.revision));
      yield* requireCurrent(entry);
      announce(entry);
    }

    const stored = yield* read(store.read(address)).pipe(
      Effect.tap(() => Effect.sync(() => persistenceRecovered("read"))),
      Effect.catch((error) =>
        Effect.sync(() => {
          persistenceFailed("read", { operation: "read", address, error });
          return undefined;
        }),
      ),
    );
    yield* requireCurrent(entry);
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
      entry.revision = nextRevision();
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
      yield* mutate(deletePersisted(address, entry.revision));
      yield* requireCurrent(entry);
      return entry;
    }

    const decoded = yield* Effect.try({
      try: () => definition.codec.decode(stored.payload, input),
      catch: (cause) => cause,
    }).pipe(Effect.exit);
    if (Exit.isSuccess(decoded)) {
      entry.value = decoded.value;
      entry.payloadBytes = stored.payloadBytes;
      entry.storedAt = stored.storedAt;
      entry.discardAt = stored.discardAt;
      entry.persistence = "durable";
      touch(entry);
      trimEntries(entry);
    } else {
      entry.revision = nextRevision();
      report({ operation: "decode", address, error: Cause.squash(decoded.cause) });
      yield* mutate(deletePersisted(address, entry.revision));
      yield* requireCurrent(entry);
    }
    return entry;
  });

  const refresh = Effect.fnUntraced(function* <Input, Value>(entry: RuntimeEntry<Input, Value>) {
    const { definition, address, input } = entry;
    // The refresh owns the loader; a timeout limits waiting, while release still
    // observes the loader's finalizers and their failures.
    const loadedExit = yield* Effect.acquireUseRelease(
      Effect.forkChild(definition.load(input)),
      (fiber) => Fiber.await(fiber).pipe(Effect.timeout(definition.policy.timeout)),
      (fiber) => interruptJobs([fiber]),
    );
    const loaded = yield* loadedExit;
    yield* requireCurrent(entry);
    const { payload, value } = yield* Effect.try({
      try: () => {
        const payload = definition.codec.encode(loaded, input);
        if (!(payload instanceof Uint8Array)) {
          throw new TypeError("A cached resource codec must encode to a byte array.");
        }
        if (payload.byteLength > definition.policy.maxEntryBytes) {
          throw new RangeError(
            `Resource ${cacheAddressKey(address)} exceeds its maximum entry size.`,
          );
        }
        const value = definition.codec.decode(payload, input);
        if (value === undefined) {
          throw new TypeError("A cached resource codec cannot decode to undefined.");
        }
        return { payload, value };
      },
      catch: (cause) => cause,
    });
    yield* requireCurrent(entry);
    const storedAt = now();
    const discardAt = storedAt + definition.policy.retainFor;
    const successRevision = nextRevision();
    entry.value = value;
    entry.payloadBytes = payload.byteLength;
    entry.storedAt = storedAt;
    entry.discardAt = discardAt;
    entry.persistence = "durable";
    entry.refresh = { state: "idle" };
    delete entry.failure;
    entry.revision = successRevision;
    touch(entry);

    yield* mutate(
      store.write({
        ...address,
        codecVersion: definition.codec.version,
        payload,
        payloadBytes: payload.byteLength,
        storedAt,
        discardAt,
        revision: successRevision,
      }),
    ).pipe(
      Effect.tap(() => Effect.sync(() => persistenceRecovered("write"))),
      Effect.catch((error) =>
        Effect.sync(() => {
          entry.persistence = "memory-only";
          persistenceFailed("write", { operation: "write", address, error });
        }),
      ),
    );
    yield* requireCurrent(entry);
    announce(entry);
    return snapshot(entry, now());
  });

  const startRefresh = Effect.fnUntraced(function* <Input, Value>(
    entry: RuntimeEntry<Input, Value>,
    force: boolean,
  ) {
    const current = FiberMap.getUnsafe(refreshes, entry);
    if (Option.isSome(current)) {
      return current.value as Fiber.Fiber<ResourceSnapshot<Value>, unknown>;
    }
    const startedAt = now();
    if (!force && entry.refresh.state === "failed" && startedAt < entry.refresh.retryAt) {
      return undefined;
    }
    entry.refresh = { state: "refreshing", startedAt };
    entry.revision = nextRevision();
    // Register background work before it or its listeners can re-enter the cache.
    const fiber = yield* FiberMap.run(
      refreshes,
      entry,
      Effect.yieldNow.pipe(
        Effect.andThen(refresh(entry)),
        Effect.onError((cause) =>
          Effect.sync(() => {
            if (
              Cause.hasInterruptsOnly(cause) ||
              state !== "open" ||
              entries.get(cacheAddressKey(entry.address)) !== entry
            ) {
              return;
            }
            const error = Cause.squash(cause);
            const failedAt = now();
            let failureKind: "source" | "timeout" = "source";
            if (Predicate.isTagged(error, "TimeoutError")) {
              failureKind = "timeout";
            }
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
          }),
        ),
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            if (Cause.hasDies(cause) || Cause.hasInterrupts(cause)) {
              return yield* Effect.failCause(cause);
            }
            yield* requireCurrent(entry);
            if (entry.value !== undefined) {
              return snapshot(entry, now());
            }
            return yield* new ResourceUnavailableError({
              address: entry.address,
              cause: Cause.squash(cause),
            });
          }),
        ),
        Effect.ensuring(Effect.sync(() => trimEntries(entry))),
        Effect.provideContext(context),
      ),
    );
    announce(entry);
    return fiber;
  });

  const discard = Effect.fnUntraced(function* (selector: CacheSelector, clear: boolean) {
    assertOpen();
    requireSelector(selector);
    const discarded = [...entries.values()].filter((entry) =>
      cacheAddressMatches(entry.address, selector),
    );
    const invalidationRevision = nextRevision();
    const active: Fiber.Fiber<unknown, unknown>[] = [];
    for (const entry of discarded) {
      const hydration = FiberMap.getUnsafe(hydrations, entry);
      const refresh = FiberMap.getUnsafe(refreshes, entry);
      if (Option.isSome(hydration)) {
        active.push(hydration.value);
      }
      if (Option.isSome(refresh)) {
        active.push(refresh.value);
      }
      entries.delete(cacheAddressKey(entry.address));
      entry.revision = invalidationRevision;
    }
    let deletion: Effect.Effect<void, unknown> = deletePersisted(selector, invalidationRevision);
    if (clear) {
      deletion = store.clear(invalidationRevision).pipe(
        Effect.tap(() => Effect.sync(() => persistenceRecovered("clear"))),
        Effect.tapError((error) =>
          Effect.sync(() => persistenceFailed("clear", { operation: "clear", error })),
        ),
      );
    }
    // Publish the persistence barrier before yielding to interrupted work or new readers.
    const deleted = yield* enqueueMutation(deletion);
    const interrupted = yield* interruptJobs(active).pipe(Effect.exit);
    const deletionExit = yield* deleted.pipe(Effect.exit);
    for (const entry of discarded) {
      announce(entry);
    }
    yield* Exit.asVoidAll([interrupted, deletionExit]);
  }, Effect.uninterruptible);

  const invalidate = Effect.fn("ResourceCache.invalidate")((selector: CacheSelector) =>
    discard(selector, false),
  );
  const clear = discard({}, true);

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      state = "closed";
      const active = [...hydrations, ...refreshes].map(([, fiber]) => fiber);
      entries.clear();
      listeners.clear();
      const interrupted = yield* interruptJobs(active).pipe(Effect.exit);
      yield* latestMutation;
      yield* FiberSet.awaitEmpty(reads);
      yield* interrupted.pipe(Effect.orDie);
    }),
  );

  yield* store.inspect().pipe(
    Effect.tap((inspection) =>
      Effect.sync(() => {
        revision = inspection.revision;
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => persistenceFailed("inspect", { operation: "inspect", error })),
    ),
  );

  return {
    define<Input, Value>(definition: ResourceDefinition<Input, Value>) {
      assertOpen();
      requireDefinition(definition);
      if (namespaces.has(definition.namespace)) {
        throw new Error(`Cached resource namespace "${definition.namespace}" is already defined.`);
      }
      namespaces.add(definition.namespace);

      const getEntry = Effect.fnUntraced(function* (input: Input) {
        assertOpen();
        const address = requireAddress(definition.address(input), definition.namespace);
        const key = cacheAddressKey(address);
        let entry = entries.get(key) as RuntimeEntry<Input, Value> | undefined;
        if (entry) {
          const hydration = FiberMap.getUnsafe(hydrations, entry);
          if (Option.isSome(hydration)) {
            return (yield* Fiber.join(hydration.value)) as RuntimeEntry<Input, Value>;
          }
          if (
            entry.value === undefined ||
            (entry.discardAt !== undefined && entry.discardAt > now())
          ) {
            touch(entry);
            return entry;
          }
        } else {
          entry = {
            address,
            definition,
            input,
            revision,
            payloadBytes: 0,
            refresh: { state: "idle" },
          };
          entries.set(key, entry);
        }
        const current = entry;
        const fiber = yield* FiberMap.run(
          hydrations,
          current,
          Effect.yieldNow.pipe(
            Effect.andThen(loadStored(current)),
            Effect.ensuring(Effect.sync(() => trimEntries(current))),
            Effect.provideContext(context),
          ),
        );
        return (yield* Fiber.join(fiber)) as RuntimeEntry<Input, Value>;
      });

      const resolve = Effect.fnUntraced(function* (input: Input) {
        const entry = yield* getEntry(input);
        const current = snapshot(entry, now());
        if (current.availability.state === "available") {
          if (current.availability.freshness === "stale") {
            yield* startRefresh(entry, false);
            return snapshot(entry, now());
          }
          return current;
        }
        const fiber = yield* startRefresh(entry, false);
        if (!fiber) {
          return yield* new ResourceUnavailableError({
            address: entry.address,
            cause: entry.failure,
          });
        }
        return yield* Fiber.join(fiber);
      });

      return {
        resolve,
        refresh: Effect.fnUntraced(function* (
          input: Input,
          options?: Readonly<{ force?: boolean }>,
        ) {
          const entry = yield* getEntry(input);
          const fiber = yield* startRefresh(entry, options?.force ?? false);
          if (fiber) {
            return yield* Fiber.join(fiber);
          }
          const current = snapshot(entry, now());
          if (current.availability.state === "available") {
            return current;
          }
          return yield* new ResourceUnavailableError({
            address: entry.address,
            cause: entry.failure,
          });
        }),
        peek: Effect.fnUntraced(function* (input: Input) {
          return snapshot(yield* getEntry(input), now());
        }),
        invalidate: (selector = {}) => invalidate({ namespace: definition.namespace, ...selector }),
      };
    },
    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate,
    clear,
    inspect: Effect.fn("ResourceCache.inspect")(function* (selector?: CacheSelector) {
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
        storeInspection = yield* read(store.inspect(selector)).pipe(
          Effect.tap(() => Effect.sync(() => persistenceRecovered("inspect"))),
          Effect.catch((error) =>
            Effect.sync(() => {
              persistenceFailed("inspect", { operation: "inspect", error });
              return undefined;
            }),
          ),
        );
      }
      let persistence: "durable" | "degraded" = "durable";
      if (persistenceFailures.size > 0) {
        persistence = "degraded";
      }
      let refreshCount = 0;
      if (state === "open") {
        for (const [entry] of refreshes) {
          if (!selector || cacheAddressMatches(entry.address, selector)) {
            refreshCount += 1;
          }
        }
      }
      const result: ResourceCacheInspection = {
        state,
        persistence,
        hotEntries,
        hotBytes,
        revision,
        refreshes: refreshCount,
      };
      if (storeInspection && lastFailure) {
        return { ...result, store: storeInspection, lastFailure };
      }
      if (storeInspection) {
        return { ...result, store: storeInspection };
      }
      if (lastFailure) {
        return { ...result, lastFailure };
      }
      return result;
    }),
  };
});
