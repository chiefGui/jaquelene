import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit, Scope } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { StoredCacheEntry } from "./cache-store";
import { openSqliteCacheStore } from "./sqlite-cache-store";

const directories: string[] = [];
const scopes = new Set<Scope.Closeable>();
const run = Effect.runPromise;

async function openStore(path: string, options: Parameters<typeof openSqliteCacheStore>[1]) {
  const scope = Scope.makeUnsafe();
  scopes.add(scope);
  const store = await run(openSqliteCacheStore(path, options).pipe(Scope.provide(scope)));
  return {
    store,
    close: async () => {
      await run(Scope.close(scope, Exit.void));
      scopes.delete(scope);
    },
  };
}

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

afterEach(async () => {
  for (const scope of scopes) {
    await run(Scope.close(scope, Exit.void));
  }
  scopes.clear();
  vi.restoreAllMocks();

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite cache store", () => {
  it("persists entries across reopen and evicts the oldest within global bounds", async () => {
    const path = cachePath();
    const reportFailure = vi.fn();
    const { store: first, close: closeFirst } = await openStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });
    await run(first.write(entry("a", 1)));
    await run(first.write(entry("b", 2)));
    await run(first.write(entry("c", 3)));
    await expect(run(first.inspect())).resolves.toMatchObject({ entries: 2, logicalBytes: 16 });
    await expect(run(first.read(entry("a", 1)))).resolves.toBeUndefined();
    await closeFirst();

    const { store: reopened, close: closeReopened } = await openStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });
    await expect(run(reopened.read(entry("b", 2)))).resolves.toMatchObject({ key: "b" });
    await expect(run(reopened.read(entry("c", 3)))).resolves.toMatchObject({ key: "c" });
    await run(reopened.clear(4));
    await expect(run(reopened.inspect())).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 4,
    });
    await closeReopened();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("rejects an entry larger than the persistent byte budget", async () => {
    const { store, close } = await openStore(cachePath(), {
      maxEntries: 2,
      maxBytes: 8,
      reportFailure: vi.fn(),
    });

    await expect(run(store.write(entry("large", 1, 9)))).rejects.toThrow(RangeError);
    await expect(run(store.inspect())).resolves.toEqual({
      entries: 0,
      logicalBytes: 0,
      revision: 0,
    });
    await close();
  });

  it("recreates only the replaceable cache when its database is corrupt", async () => {
    const path = cachePath();
    const reportFailure = vi.fn();
    writeFileSync(path, "not a sqlite database");

    const { store, close } = await openStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });

    await expect(run(store.inspect())).resolves.toEqual({
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
    await close();
  });

  it("recovers a corrupt cache even when failure reporting throws", async () => {
    const path = cachePath();
    const reporterFailure = new Error("Reporter unavailable.");
    const reportFailure = vi.fn(() => {
      throw reporterFailure;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeFileSync(path, "not a sqlite database");

    const { store, close } = await openStore(path, {
      maxEntries: 2,
      maxBytes: 64,
      reportFailure,
    });

    await expect(run(store.inspect())).resolves.toEqual({
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
    await close();
  });
});
