import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { StoredCacheEntry } from "./cache-store";
import { openSqliteCacheStore } from "./sqlite-cache-store";

const directories: string[] = [];

function cachePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-resource-cache-"));
  directories.push(directory);
  return join(directory, "jaquelene-cache.sqlite");
}

function entry(key: string, storedAt: number, payloadBytes = 8): StoredCacheEntry {
  const payload = new Uint8Array(payloadBytes).fill(key.charCodeAt(0));
  return {
    namespace: "catalog",
    scope: "provider",
    key,
    codecVersion: 1,
    payload,
    payloadBytes: payload.byteLength,
    storedAt,
    discardAt: Date.now() + 60_000,
    revision: storedAt,
  };
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite cache store", () => {
  it("persists entries across reopen and evicts the oldest within global bounds", async () => {
    const path = cachePath();
    const reportFailure = vi.fn();
    const first = await openSqliteCacheStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });
    await first.write(entry("a", 1));
    await first.write(entry("b", 2));
    await first.write(entry("c", 3));
    await expect(first.inspect()).resolves.toMatchObject({ entries: 2, logicalBytes: 16 });
    await expect(first.read(entry("a", 1))).resolves.toBeUndefined();
    await first.close();

    const reopened = await openSqliteCacheStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });
    await expect(reopened.read(entry("b", 2))).resolves.toMatchObject({ key: "b" });
    await expect(reopened.read(entry("c", 3))).resolves.toMatchObject({ key: "c" });
    await reopened.clear(4);
    await expect(reopened.inspect()).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 4,
    });
    await reopened.close();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("rejects an entry larger than the persistent byte budget", async () => {
    const store = await openSqliteCacheStore(cachePath(), {
      maxEntries: 2,
      maxBytes: 8,
      reportFailure: vi.fn(),
    });

    await expect(store.write(entry("large", 1, 9))).rejects.toThrow(RangeError);
    await expect(store.inspect()).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 0,
    });
    await store.close();
  });

  it("recreates only the replaceable cache when its database is corrupt", async () => {
    const path = cachePath();
    const reportFailure = vi.fn();
    writeFileSync(path, "not a sqlite database");

    const store = await openSqliteCacheStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });

    await expect(store.inspect()).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 0,
    });
    expect(reportFailure).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: "open" }),
    );
    expect(reportFailure).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operation: "recover" }),
    );
    await store.close();
  });

  it("recovers a corrupt cache even when failure reporting throws", async () => {
    const path = cachePath();
    const reporterFailure = new Error("Reporter unavailable.");
    const reportFailure = vi.fn(() => {
      throw reporterFailure;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeFileSync(path, "not a sqlite database");

    const store = await openSqliteCacheStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });

    await expect(store.inspect()).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 0,
    });
    expect(reportFailure).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      "Could not report a resource cache storage failure.",
      expect.objectContaining({ errors: expect.arrayContaining([reporterFailure]) }),
    );
    await store.close();
  });
});
