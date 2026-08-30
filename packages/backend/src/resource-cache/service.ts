import { Context, Effect, Layer } from "effect";
import {
  createResourceCache,
  type ResourceCache,
  type ResourceCacheFailure,
} from "./resource-cache";
import { openSqliteCacheStore } from "./sqlite-cache-store";

export type ResourceCacheServiceOptions = Readonly<{
  path: string;
  reportFailure: (failure: ResourceCacheFailure) => void;
}>;

async function closeAfterFailedAcquisition(
  resource: { close: () => Promise<void> },
  failure: unknown,
): Promise<never> {
  try {
    await resource.close();
  } catch (closeFailure) {
    throw new AggregateError(
      [failure, closeFailure],
      "Could not close the resource cache after it failed to start.",
    );
  }

  throw failure;
}

async function openOwnedResourceCache(options: ResourceCacheServiceOptions, signal: AbortSignal) {
  signal.throwIfAborted();
  const store = await openSqliteCacheStore(options.path, {
    maxEntries: 512,
    maxBytes: 64 * 1_024 * 1_024,
    reportFailure: options.reportFailure,
  });

  try {
    signal.throwIfAborted();
    const cache = await createResourceCache(store, {
      maxHotEntries: 64,
      maxHotBytes: 32 * 1_024 * 1_024,
      reportFailure: options.reportFailure,
    });

    if (signal.aborted) {
      return closeAfterFailedAcquisition(cache, signal.reason);
    }

    return cache;
  } catch (error) {
    return closeAfterFailedAcquisition(store, error);
  }
}

export class ResourceCacheService extends Context.Service<ResourceCacheService, ResourceCache>()(
  "@jaquelene/backend/ResourceCache",
) {
  static readonly layer = (options: ResourceCacheServiceOptions) =>
    Layer.effect(
      this,
      Effect.acquireRelease(
        Effect.tryPromise({
          try: (signal) => openOwnedResourceCache(options, signal),
          catch: (error) =>
            error instanceof Error
              ? error
              : new Error("Could not open the resource cache.", { cause: error }),
        }),
        (cache) => Effect.promise(() => cache.close()),
        { interruptible: true },
      ),
    );
}
