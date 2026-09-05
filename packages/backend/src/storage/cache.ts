import { Effect } from "effect";
import { ResourceCacheService } from "#backend/resource-cache/service";
import { getCacheStoragePaths } from "#backend/resource-cache/sqlite-cache-store";
import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "./area";

export function createCacheStorageArea(cachePath: string): StorageArea<ResourceCacheService> {
  const id = "cache";
  return {
    id,
    category: StorageCategory.Cache,
    paths: getCacheStoragePaths(cachePath),
    delete: ResourceCacheService.use((cache) =>
      Effect.tryPromise({
        try: () => cache.clear(),
        catch: (cause) => new StorageAreaDeleteError({ areaId: id, cause }),
      }).pipe(Effect.uninterruptible),
    ),
  };
}
