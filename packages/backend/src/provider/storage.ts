import { Effect } from "effect";
import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "#backend/storage/area";
import type { ProviderId } from "./provider";
import { ProvidersService } from "./providers";

export function createProviderStorageArea(
  providerId: ProviderId,
  paths: readonly string[],
): StorageArea<ProvidersService> {
  const id = `provider:${providerId}`;
  return {
    id,
    category: StorageCategory.AppData,
    paths,
    delete: ProvidersService.use(({ providers }) =>
      Effect.tryPromise({
        try: () => providers.clearConfiguration(providerId),
        catch: (cause) => new StorageAreaDeleteError({ areaId: id, cause }),
      }).pipe(Effect.uninterruptible),
    ),
  };
}
