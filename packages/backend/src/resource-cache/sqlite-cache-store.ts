import { rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { getDatabaseStoragePaths } from "#backend/database/database";
import type {
  CacheAddress,
  CacheSelector,
  CacheStore,
  CacheStoreInspection,
  StoredCacheEntry,
} from "./cache-store";
import type { ResourceCacheFailure } from "./resource-cache";

const schemaVersion = 1;

export type SqliteCacheStoreOptions = Readonly<{
  maxEntries: number;
  maxBytes: number;
  reportFailure: (failure: ResourceCacheFailure) => void;
}>;

type StoredRow = Readonly<{
  namespace: string;
  scope: string;
  cacheKey: string;
  codecVersion: number;
  payload: Uint8Array;
  payloadBytes: number;
  storedAt: number;
  discardAt: number;
  revision: number;
}>;

type CountRow = Readonly<{
  entries: number;
  logicalBytes: number;
}>;

type RevisionRow = Readonly<{ revision: number }>;

function requireLimit(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${description} must be a positive safe integer.`);
  }
}

function initialize(database: DatabaseSync) {
  database.exec("PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  const version = database.prepare("PRAGMA user_version").get() as { user_version: number };

  if (version.user_version !== schemaVersion) {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP TABLE IF EXISTS cache_entries;
      DROP TABLE IF EXISTS cache_meta;
      CREATE TABLE cache_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        logical_bytes INTEGER NOT NULL
      ) STRICT;
      INSERT INTO cache_meta (id, revision, logical_bytes) VALUES (1, 0, 0);
      CREATE TABLE cache_entries (
        namespace TEXT NOT NULL,
        scope TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        codec_version INTEGER NOT NULL,
        payload BLOB NOT NULL,
        payload_bytes INTEGER NOT NULL,
        stored_at INTEGER NOT NULL,
        discard_at INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        PRIMARY KEY (namespace, scope, cache_key)
      ) STRICT;
      CREATE INDEX cache_entries_expiration ON cache_entries (discard_at);
      CREATE INDEX cache_entries_eviction ON cache_entries (stored_at);
      PRAGMA user_version = ${schemaVersion};
      COMMIT;
    `);
  }
}

function open(path: string) {
  const database = new DatabaseSync(path);

  try {
    initialize(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

async function removeCacheDatabase(path: string) {
  await Promise.all(
    getDatabaseStoragePaths(path).map((ownedPath) => rm(ownedPath, { force: true })),
  );
}

function transaction<Result>(database: DatabaseSync, operation: () => Result) {
  database.exec("BEGIN IMMEDIATE;");

  try {
    const result = operation();
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Preserve the operation failure; the store will surface subsequent damage on access.
    }

    throw error;
  }
}

function selectorClause(selector: CacheSelector) {
  const clauses: string[] = [];
  const values: string[] = [];

  if (selector.namespace !== undefined) {
    clauses.push("namespace = ?");
    values.push(selector.namespace);
  }

  if (selector.scope !== undefined) {
    clauses.push("scope = ?");
    values.push(selector.scope);
  }

  if (selector.key !== undefined) {
    clauses.push("cache_key = ?");
    values.push(selector.key);
  }

  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function readCounts(database: DatabaseSync, selector?: CacheSelector) {
  const clause = selectorClause(selector ?? {});
  return database
    .prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(payload_bytes), 0) AS logicalBytes
       FROM cache_entries${clause.sql}`,
    )
    .get(...clause.values) as CountRow;
}

function updateMeta(database: DatabaseSync, revision: number) {
  const { logicalBytes } = readCounts(database);
  database
    .prepare(
      `UPDATE cache_meta
       SET revision = MAX(revision, ?), logical_bytes = ?
       WHERE id = 1`,
    )
    .run(revision, logicalBytes);
}

export function getCacheStoragePaths(path: string) {
  return getDatabaseStoragePaths(path);
}

export async function openSqliteCacheStore(
  path: string,
  options: SqliteCacheStoreOptions,
): Promise<CacheStore> {
  requireLimit(options.maxEntries, "The persistent cache entry limit");
  requireLimit(options.maxBytes, "The persistent cache byte limit");

  let database: DatabaseSync;

  try {
    database = open(path);
  } catch (error) {
    options.reportFailure({ operation: "open", error });

    try {
      await removeCacheDatabase(path);
      database = open(path);
      options.reportFailure({
        operation: "recover",
        error: new Error("The replaceable cache database was corrupt and has been recreated.", {
          cause: error,
        }),
      });
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        "The cache database could not be opened or recreated.",
      );
    }
  }

  let closed = false;

  function assertOpen() {
    if (closed) {
      throw new Error("Cache store is closed.");
    }
  }

  return {
    async read(address: CacheAddress) {
      assertOpen();
      const row = database
        .prepare(
          `SELECT
             namespace,
             scope,
             cache_key AS cacheKey,
             codec_version AS codecVersion,
             payload,
             payload_bytes AS payloadBytes,
             stored_at AS storedAt,
             discard_at AS discardAt,
             revision
           FROM cache_entries
           WHERE namespace = ? AND scope = ? AND cache_key = ?`,
        )
        .get(address.namespace, address.scope, address.key) as StoredRow | undefined;

      if (!row) {
        return undefined;
      }

      return {
        namespace: row.namespace,
        scope: row.scope,
        key: row.cacheKey,
        codecVersion: row.codecVersion,
        payload: new Uint8Array(row.payload),
        payloadBytes: row.payloadBytes,
        storedAt: row.storedAt,
        discardAt: row.discardAt,
        revision: row.revision,
      } satisfies StoredCacheEntry;
    },

    async write(entry) {
      assertOpen();
      transaction(database, () => {
        database.prepare("DELETE FROM cache_entries WHERE discard_at <= ?").run(Date.now());
        database
          .prepare(
            `INSERT INTO cache_entries (
               namespace,
               scope,
               cache_key,
               codec_version,
               payload,
               payload_bytes,
               stored_at,
               discard_at,
               revision
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (namespace, scope, cache_key) DO UPDATE SET
               codec_version = excluded.codec_version,
               payload = excluded.payload,
               payload_bytes = excluded.payload_bytes,
               stored_at = excluded.stored_at,
               discard_at = excluded.discard_at,
               revision = excluded.revision`,
          )
          .run(
            entry.namespace,
            entry.scope,
            entry.key,
            entry.codecVersion,
            entry.payload,
            entry.payloadBytes,
            entry.storedAt,
            entry.discardAt,
            entry.revision,
          );

        const candidates = database
          .prepare(
            `SELECT namespace, scope, cache_key AS cacheKey, payload_bytes AS payloadBytes
             FROM cache_entries
             ORDER BY stored_at ASC, namespace ASC, scope ASC, cache_key ASC`,
          )
          .all() as Array<Pick<StoredRow, "namespace" | "scope" | "cacheKey" | "payloadBytes">>;
        let entryCount = candidates.length;
        let logicalBytes = candidates.reduce(
          (total, candidate) => total + candidate.payloadBytes,
          0,
        );

        for (const candidate of candidates) {
          if (entryCount <= options.maxEntries && logicalBytes <= options.maxBytes) {
            break;
          }

          database
            .prepare(
              `DELETE FROM cache_entries
               WHERE namespace = ? AND scope = ? AND cache_key = ?`,
            )
            .run(candidate.namespace, candidate.scope, candidate.cacheKey);
          entryCount -= 1;
          logicalBytes -= candidate.payloadBytes;
        }

        database
          .prepare(
            `UPDATE cache_meta
             SET revision = MAX(revision, ?), logical_bytes = ?
             WHERE id = 1`,
          )
          .run(entry.revision, logicalBytes);
      });
    },

    async delete(selector, revision) {
      assertOpen();
      const clause = selectorClause(selector);
      transaction(database, () => {
        database.prepare(`DELETE FROM cache_entries${clause.sql}`).run(...clause.values);
        updateMeta(database, revision);
      });
    },

    async clear(revision) {
      assertOpen();
      transaction(database, () => {
        database.prepare("DELETE FROM cache_entries").run();
        database
          .prepare(
            "UPDATE cache_meta SET revision = MAX(revision, ?), logical_bytes = 0 WHERE id = 1",
          )
          .run(revision);
      });
      database.exec("VACUUM; PRAGMA optimize;");
    },

    async inspect(selector) {
      assertOpen();
      const counts = readCounts(database, selector);
      const { revision } = database
        .prepare("SELECT revision FROM cache_meta WHERE id = 1")
        .get() as RevisionRow;

      return {
        entries: counts.entries,
        logicalBytes: counts.logicalBytes,
        revision,
      } satisfies CacheStoreInspection;
    },

    async close() {
      if (closed) {
        return;
      }

      closed = true;
      database.exec("PRAGMA optimize;");
      database.close();
    },
  };
}
