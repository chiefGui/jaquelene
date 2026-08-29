import type { Storage } from "@jaquelene/backend";
import { Storage as StorageIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

export function exposeStorage(target: WebFrameMain, storage: Storage) {
  StorageIpc.for(target).setImplementation(storage);
}
