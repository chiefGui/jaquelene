import { StorageCategory, type StorageArea } from "@jaquelene/backend";
import { diagnosticsStorageAreaId } from "@jaquelene/diagnostics";
import type { ApplicationDiagnostics } from "./diagnostics";
import { getDiagnosticsStoragePath } from "./diagnostics";

export function createDiagnosticsStorageArea(
  userDataDirectory: string,
  diagnostics: ApplicationDiagnostics,
): StorageArea {
  return {
    id: diagnosticsStorageAreaId,
    category: StorageCategory.AppData,
    paths: [getDiagnosticsStoragePath(userDataDirectory)],
    delete: diagnostics.deleteAll,
  };
}
