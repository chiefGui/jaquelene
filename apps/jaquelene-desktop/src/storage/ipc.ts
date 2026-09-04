import {
  StorageCategory as BackendStorageCategory,
  type Backend,
  type StorageCategory,
  type StorageDeletion,
  type StorageUsage,
} from "@jaquelene/backend";
import { Storage as StorageIpc, StorageCategory as IpcStorageCategory } from "@jaquelene/ipc/main";
import type * as Effect from "effect/Effect";
import type { WebFrameMain } from "electron";

export type BackendEffectRunner = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
) => Promise<Success>;

function toIpcCategory(category: StorageCategory) {
  switch (category) {
    case BackendStorageCategory.Content:
      return IpcStorageCategory.Content;
    case BackendStorageCategory.AppData:
      return IpcStorageCategory.AppData;
    case BackendStorageCategory.Cache:
      return IpcStorageCategory.Cache;
  }
}

function fromIpcCategory(category: IpcStorageCategory): StorageCategory {
  switch (category) {
    case IpcStorageCategory.Content:
      return BackendStorageCategory.Content;
    case IpcStorageCategory.AppData:
      return BackendStorageCategory.AppData;
    case IpcStorageCategory.Cache:
      return BackendStorageCategory.Cache;
  }
}

function toIpcAreas(value: StorageUsage | StorageDeletion) {
  return {
    areas: value.areas.map((area) => ({
      id: area.id,
      category: toIpcCategory(area.category),
      bytes: area.bytes,
    })),
  };
}

export function exposeStorage(
  target: WebFrameMain,
  storage: Backend["storage"],
  runBackendEffect: BackendEffectRunner,
) {
  StorageIpc.for(target).setImplementation({
    async measureUsage() {
      return toIpcAreas(await runBackendEffect(storage.measureUsage()));
    },
    async deleteArea(id) {
      return toIpcAreas(await runBackendEffect(storage.deleteArea(id)));
    },
    async deleteCategory(id) {
      return toIpcAreas(await runBackendEffect(storage.deleteCategory(fromIpcCategory(id))));
    },
  });
}
