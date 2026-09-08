import { StorageCategory } from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = vi.hoisted(() => ({
  measureUsage: vi.fn(),
  deleteArea: vi.fn(),
  deleteCategory: vi.fn(),
}));
vi.mock("@jaquelene/ipc/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@jaquelene/ipc/renderer")>()),
  Storage: storage,
}));
vi.mock("@/feature/diagnostics/diagnostics", () => ({ reportError: vi.fn() }));

import { deleteStorageCategoryMutationOptions, storageUsageQuery } from "./query";
import { appDataStorageMeta, dispatchStorageWrite } from "./lifecycle";

const clients: QueryClient[] = [];
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("app data deletion lifecycle", () => {
  it.each(["success", "failure"])(
    "waits for an existing write's %s, then deletes and refreshes before accepting another write",
    async (outcome) => {
      const client = new QueryClient();
      clients.push(client);
      const queryKey = ["independent-feature"];
      const save = deferred<number>();
      const refresh = deferred<number>();
      const read = vi.fn(() => refresh.promise);
      const query = new QueryObserver(client, {
        queryKey,
        queryFn: read,
        meta: appDataStorageMeta,
        staleTime: Infinity,
        initialData: 1,
      });
      const unsubscribe = query.subscribe(() => {});
      client.setQueryData(storageUsageQuery.queryKey, {
        areas: [{ id: "preferences", category: StorageCategory.AppData, bytes: 10 }],
      });
      const mutationKey = ["independent-feature", "write"];
      const write = new MutationObserver(client, {
        mutationKey,
        meta: appDataStorageMeta,
        mutationFn: () => save.promise,
        onSuccess: (value) => {
          client.setQueryData(queryKey, value);
        },
        onError: () => {
          client.setQueryData(queryKey, 1);
        },
      });
      const writeResult = write.mutate().catch(() => undefined);
      storage.deleteCategory.mockResolvedValue({
        areas: [{ id: "preferences", category: StorageCategory.AppData, bytes: 0 }],
      });
      const deletion = new MutationObserver(client, deleteStorageCategoryMutationOptions(client));
      const deleted = deletion.mutate(StorageCategory.AppData);
      const dispatch = vi.fn();
      expect(
        dispatchStorageWrite(
          client,
          StorageCategory.AppData,
          ["another-feature", "write"],
          dispatch,
        ),
      ).toBe(false);
      await vi.waitFor(() => expect(write.getCurrentResult().isPending).toBe(true));
      expect(storage.deleteCategory).not.toHaveBeenCalled();
      if (outcome === "success") save.resolve(2);
      else save.reject(new Error("Save failed"));
      await writeResult;
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      expect(storage.deleteCategory).toHaveBeenCalledOnce();
      expect(deletion.getCurrentResult().isPending).toBe(true);
      expect(dispatchStorageWrite(client, StorageCategory.AppData, mutationKey, dispatch)).toBe(
        false,
      );
      refresh.resolve(0);
      await deleted;
      expect(client.getQueryData(queryKey)).toBe(0);
      expect(dispatchStorageWrite(client, StorageCategory.AppData, mutationKey, dispatch)).toBe(
        true,
      );
      unsubscribe();
    },
  );
});
