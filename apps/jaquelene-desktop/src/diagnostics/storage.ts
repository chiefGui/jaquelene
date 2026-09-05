import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "@jaquelene/backend";
import { diagnosticsStorageAreaId } from "@jaquelene/diagnostics";
import { Effect } from "effect";
import { ApplicationDiagnosticsService, getDiagnosticsStoragePath } from "./diagnostics";

export function createDiagnosticsStorageArea(
  userDataDirectory: string,
): StorageArea<ApplicationDiagnosticsService> {
  return {
    id: diagnosticsStorageAreaId,
    category: StorageCategory.AppData,
    paths: [getDiagnosticsStoragePath(userDataDirectory)],
    delete: ApplicationDiagnosticsService.use((diagnostics) =>
      Effect.tryPromise({
        try: () => diagnostics.deleteAll(),
        catch: (cause) => new StorageAreaDeleteError({ areaId: diagnosticsStorageAreaId, cause }),
      }).pipe(Effect.uninterruptible),
    ),
  };
}
