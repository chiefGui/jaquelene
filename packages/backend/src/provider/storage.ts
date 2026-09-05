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
      providers.clearConfiguration(providerId).pipe(
        Effect.mapError((cause) => new StorageAreaDeleteError({ areaId: id, cause })),
        Effect.uninterruptible,
      ),
    ),
  };
}
