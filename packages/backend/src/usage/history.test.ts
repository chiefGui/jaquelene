import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import { createThreads } from "#backend/thread/threads";
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
  const pending = {
    id: ids.providerAttempt.create(),
    executionId: "execution-1",
    providerId: "openrouter",
    requestedModelId: "maker/model",
    status,
    startedAt,
  } as const;

  if (status === "completed") {
    return { ...pending, finishedAt: startedAt + 1 };
  }

  return pending;
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
    const threads = createThreads(database);
    const thread = threads.create();
    const { turn } = threads.startTurn(thread.id, "Preparing a reply");
    database
      .insert(generationTable)
      .values({
        id: ids.generation.create(),
        turnId: turn.id,
        intent: "reply",
        providerId: "provider-a",
        modelId: "maker/model",
        status: "pending",
        startedAt: 100,
      })
      .run();
    const preparing = database.select().from(generationTable).all();

    expect(usage.clear()).toEqual({ deletedAttempts: 1 });
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
    expect(changed).toHaveBeenCalledOnce();
    expect(database.select().from(generationTable).all()).toEqual(preparing);
    expect(threads.get(thread.id)).not.toBeNull();
    expect(usage.clear()).toEqual({ deletedAttempts: 0 });
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

  it.each([
    { attributionKind: "campaign", attributionId: null },
    { attributionKind: null, attributionId: "campaign-1" },
    { attributionKind: " \t", attributionId: "campaign-1" },
    { attributionKind: "campaign", attributionId: "\u00a0" },
    { executionId: "\n" },
  ])("rejects incomplete or blank attribution and execution identity: %j", (invalid) => {
    const { database } = openEnvironment();
    expect(() =>
      database
        .insert(providerAttemptTable)
        .values({
          ...attempt("pending"),
          ...invalid,
        })
        .run(),
    ).toThrow();
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
  });

  it.each([
    { costCurrency: null, costSource: "provider-reported" as const },
    { costCurrency: "USD", costSource: null },
  ])("rejects costs with missing currency or source: %j", (incomplete) => {
    const { database } = openEnvironment();
    expect(() =>
      database
        .insert(providerAttemptTable)
        .values({
          ...attempt("completed"),
          inputTokens: 2,
          outputTokens: 1,
          totalTokens: 3,
          costAmountNanos: 10,
          ...incomplete,
        })
        .run(),
    ).toThrow();
  });
});
