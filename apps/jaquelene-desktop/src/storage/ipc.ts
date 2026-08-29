import {
  StorageCategory as BackendStorageCategory,
  type Storage,
  type StorageCategory,
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

function toIpcUsage(usage: StorageUsage) {
  return {
    categories: usage.categories.map((category) => ({
      id: toIpcCategory(category.id),
      bytes: category.bytes,
    })),
  };
}

export function exposeStorage(target: WebFrameMain, storage: Storage) {
  StorageIpc.for(target).setImplementation({
    async measureUsage() {
      return toIpcUsage(await storage.measureUsage());
    },
    async deleteCategory(id) {
      return toIpcUsage(await storage.deleteCategory(fromIpcCategory(id)));
    },
  });
}
