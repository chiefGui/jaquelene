import { Storage as StorageIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { AppStorage } from "./storage";

export function exposeStorage(target: WebFrameMain, storage: AppStorage) {
  StorageIpc.for(target).setImplementation(storage);
}
