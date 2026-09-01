import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createUsageHistory } from "./history";
import { providerAttemptTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function openEnvironment() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-usage-history-"));
  const database = openDatabase(join(directory, "jaquelene.sqlite"));
  directories.push(directory);
  databases.push(database);
  return { database, usage: createUsageHistory(database) };
}

function attempt(status: "pending" | "completed") {
  const startedAt = 100;
  return {
    id: ids.providerAttempt.create(),
    generationId: ids.generation.create(),
    threadId: ids.thread.create(),
    providerId: "openrouter",
    requestedModelId: "maker/model",
    status,
    startedAt,
    ...(status === "completed" ? { finishedAt: startedAt + 1 } : {}),
  } as const;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("usage history", () => {
  it("clears settled usage without touching content-owned tables", () => {
    const { database, usage } = openEnvironment();
    const changed = vi.fn();
    usage.subscribe(changed);
    database.insert(providerAttemptTable).values(attempt("completed")).run();

    expect(usage.clear()).toEqual({ deletedAttempts: 1 });
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("refuses to clear while an attempt is active", () => {
    const { database, usage } = openEnvironment();
    database.insert(providerAttemptTable).values(attempt("pending")).run();

    expect(() => usage.clear()).toThrow("active");
    expect(database.select().from(providerAttemptTable).all()).toHaveLength(1);
  });

  it("enforces canonical accounting and lifecycle state", () => {
    const { database } = openEnvironment();
    const completed = attempt("completed");

    expect(() =>
      database
        .insert(providerAttemptTable)
        .values({
          ...completed,
          inputTokens: 2,
          outputTokens: 1,
          totalTokens: 3,
          costCurrency: "EUR",
          costAmountNanos: 10,
          costSource: "provider-reported",
        })
        .run(),
    ).not.toThrow();
    expect(() =>
      database
        .insert(providerAttemptTable)
        .values({
          ...completed,
          id: ids.providerAttempt.create(),
          inputTokens: 2,
          outputTokens: 1,
          totalTokens: 3,
          costCurrency: "usd",
          costAmountNanos: 10,
          costSource: "provider-reported",
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(providerAttemptTable)
        .values({
          ...completed,
          id: ids.providerAttempt.create(),
          inputTokens: 2,
          outputTokens: 1,
        })
        .run(),
    ).toThrow();
  });
});
