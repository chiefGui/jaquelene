import { StorageCategory } from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  appDataStorageMeta,
  deleteStorageCategoryMutationKey,
  dispatchStorageWrite,
  storageQueries,
  waitForStorageWrites,
} from "./lifecycle";

const clients: QueryClient[] = [];
function client() {
  const queryClient = new QueryClient();
  clients.push(queryClient);
  return queryClient;
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  for (const queryClient of clients.splice(0)) queryClient.clear();
});

describe("storage lifecycle", () => {
  it("discovers category queries by metadata without knowing feature keys", async () => {
    const queryClient = client();
    await queryClient.fetchQuery({
      queryKey: ["new-feature"],
      queryFn: () => 1,
      meta: appDataStorageMeta,
    });
    await queryClient.fetchQuery({
      queryKey: ["cache"],
      queryFn: () => 2,
      meta: { storageCategory: StorageCategory.Cache },
    });
    await queryClient.fetchQuery({ queryKey: ["unrelated"], queryFn: () => 3 });
    expect(queryClient.getQueriesData(storageQueries(StorageCategory.AppData))).toEqual([
      [["new-feature"], 1],
    ]);
  });

  it.each(["success", "failure"])(
    "waits for writes and their reconciliation on %s",
    async (outcome) => {
      const queryClient = client();
      const save = deferred();
      const reconcile = deferred();
      const write = new MutationObserver(queryClient, {
        meta: appDataStorageMeta,
        mutationFn: () => save.promise,
        onSettled: () => reconcile.promise,
      });
      const result = write.mutate().catch(() => undefined);
      const drained = vi.fn();
      const drain = waitForStorageWrites(queryClient, StorageCategory.AppData).then(drained);
      if (outcome === "success") save.resolve();
      else save.reject(new Error("Could not save"));
      await vi.waitFor(() => expect(write.getCurrentResult().isPending).toBe(true));
      expect(drained).not.toHaveBeenCalled();
      reconcile.resolve();
      await Promise.all([result, drain]);
      expect(drained).toHaveBeenCalledOnce();
    },
  );

  it("ignores writes to other categories", async () => {
    const queryClient = client();
    const save = deferred();
    const write = new MutationObserver(queryClient, {
      meta: { storageCategory: StorageCategory.Cache },
      mutationFn: () => save.promise,
    });
    const result = write.mutate();
    await waitForStorageWrites(queryClient, StorageCategory.AppData);
    expect(write.getCurrentResult().isPending).toBe(true);
    save.resolve();
    await result;
  });

  it("blocks writes throughout deletion and refresh without blocking another category", async () => {
    const queryClient = client();
    const deletion = deferred();
    const refresh = deferred();
    const reset = new MutationObserver(queryClient, {
      mutationKey: deleteStorageCategoryMutationKey,
      mutationFn: (_category: StorageCategory) => deletion.promise,
      onSettled: () => refresh.promise,
    });
    const result = reset.mutate(StorageCategory.AppData);
    const dispatch = vi.fn();
    expect(dispatchStorageWrite(queryClient, StorageCategory.AppData, ["write"], dispatch)).toBe(
      false,
    );
    expect(
      dispatchStorageWrite(queryClient, StorageCategory.Cache, ["write-cache"], dispatch),
    ).toBe(true);
    await waitForStorageWrites(queryClient, StorageCategory.AppData);
    deletion.resolve();
    expect(dispatchStorageWrite(queryClient, StorageCategory.AppData, ["write"], dispatch)).toBe(
      false,
    );
    refresh.resolve();
    await result;
    expect(dispatchStorageWrite(queryClient, StorageCategory.AppData, ["write"], dispatch)).toBe(
      true,
    );
  });
});
