import { Effect } from "effect";
import type { ResourceCache } from "#backend/resource-cache/resource-cache";
import { getCacheStoragePaths } from "#backend/resource-cache/sqlite-cache-store";
import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "./storage";

export function createCacheStorageArea(cache: ResourceCache, cachePath: string): StorageArea {
  return {
    id: "cache",
    category: StorageCategory.Cache,
    paths: getCacheStoragePaths(cachePath),
    delete: Effect.tryPromise({
      try: () => cache.clear(),
      catch: (cause) => new StorageAreaDeleteError({ areaId: "cache", cause }),
    }).pipe(Effect.uninterruptible),
  };
}
