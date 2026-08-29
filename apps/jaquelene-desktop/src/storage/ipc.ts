import {
  StorageCategory as BackendStorageCategory,
  type Storage,
  type StorageCategory,
  type StorageDeletion,
  type StorageUsage,
} from "@jaquelene/backend";
import { Storage as StorageIpc, StorageCategory as IpcStorageCategory } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcCategory(category: StorageCategory) {
  switch (category) {
    case BackendStorageCategory.Content:
      return IpcStorageCategory.Content;
    case BackendStorageCategory.AppData:
      return IpcStorageCategory.AppData;
  }
}

function fromIpcCategory(category: IpcStorageCategory): StorageCategory {
  switch (category) {
    case IpcStorageCategory.Content:
      return BackendStorageCategory.Content;
    case IpcStorageCategory.AppData:
      return BackendStorageCategory.AppData;
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

export function exposeStorage(target: WebFrameMain, storage: Storage) {
  StorageIpc.for(target).setImplementation({
    async measureUsage() {
      return toIpcAreas(await storage.measureUsage());
    },
    async deleteArea(id) {
      return toIpcAreas(await storage.deleteArea(id));
    },
    async deleteCategory(id) {
      return toIpcAreas(await storage.deleteCategory(fromIpcCategory(id)));
    },
  });
}
