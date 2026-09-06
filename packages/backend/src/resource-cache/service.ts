import { Context, Effect, Layer, Schema } from "effect";
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

export class ResourceCacheOpeningError extends Schema.TaggedError<ResourceCacheOpeningError>()(
  "ResourceCacheOpeningError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not open the resource cache.";
  }
}

export class ResourceCacheService extends Context.Service<ResourceCacheService, ResourceCache>()(
  "@jaquelene/backend/ResourceCache",
) {
  static readonly layer = (options: ResourceCacheServiceOptions) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const store = yield* openSqliteCacheStore(options.path, {
          maxEntries: 512,
          maxBytes: 64 * 1_024 * 1_024,
          reportFailure: options.reportFailure,
        });
        return yield* createResourceCache(store, {
          maxHotEntries: 64,
          maxHotBytes: 32 * 1_024 * 1_024,
          reportFailure: options.reportFailure,
        });
      }).pipe(Effect.mapError((cause) => new ResourceCacheOpeningError({ cause }))),
    );
}
