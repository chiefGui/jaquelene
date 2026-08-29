import { rmSync } from "node:fs";

type StoreFile = Readonly<{
  clear: () => void;
  path: string;
}>;

export function deleteStoreFile(store: StoreFile) {
  store.clear();
  rmSync(store.path, { force: true });
}
