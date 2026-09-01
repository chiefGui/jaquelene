import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import { createUsageOverviewReader } from "./overview";
import { providerAttemptTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function openEnvironment(now: number) {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-usage-overview-"));
  const database = openDatabase(join(directory, "jaquelene.sqlite"));
  directories.push(directory);
  databases.push(database);
  return { database, overview: createUsageOverviewReader(database, () => now) };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("usage overview", () => {
  it("aggregates known values while preserving unknown and pending coverage", () => {
    const now = new Date(2026, 8, 1, 12).getTime();
    const { database, overview } = openEnvironment(now);
    const threadId = ids.thread.create();
    const common = { threadId, providerId: "openrouter", requestedModelId: "maker/model" };

    database
      .insert(providerAttemptTable)
      .values([
        {
          ...common,
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          status: "completed",
          inputTokens: 10,
          cacheReadInputTokens: 3,
          outputTokens: 4,
          reasoningOutputTokens: 2,
          totalTokens: 14,
          costCurrency: "USD",
          costAmountNanos: 25_000,
          costSource: "provider-reported",
          startedAt: new Date(2026, 8, 1, 8).getTime(),
          finishedAt: new Date(2026, 8, 1, 8, 1).getTime(),
        },
        {
          ...common,
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          status: "failed",
          failureKind: "provider",
          startedAt: new Date(2026, 7, 31, 8).getTime(),
          finishedAt: new Date(2026, 7, 31, 8, 1).getTime(),
        },
        {
          ...common,
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          status: "pending",
          startedAt: new Date(2026, 8, 1, 10).getTime(),
        },
      ])
      .run();

    const snapshot = overview.get("last-7-days");

    expect(snapshot.attempts).toEqual({ provider: 3, pending: 1, completed: 1, failed: 1 });
    expect(snapshot.tokenCoverage).toEqual({ reported: 1, unknown: 1 });
    expect(snapshot.tokens).toEqual({
      input: 10,
      output: 4,
      total: 14,
      cacheReadInput: 3,
      reasoningOutput: 2,
    });
    expect(snapshot.costCoverage).toEqual({ reported: 1, unknown: 1 });
    expect(snapshot.costs).toEqual([
      {
        currency: "USD",
        source: "provider-reported",
        amountNanos: 25_000,
        attempts: 1,
      },
    ]);
    expect(snapshot.buckets).toHaveLength(7);
    expect(snapshot.buckets.at(-1)).toEqual(
      expect.objectContaining({
        attempts: { provider: 2, pending: 1, completed: 1, failed: 0 },
        tokenCoverage: { reported: 1, unknown: 0 },
      }),
    );
  });

  it("returns a stable zero-filled overview when history is empty", () => {
    const now = new Date(2026, 8, 1, 12).getTime();
    const { overview } = openEnvironment(now);
    const snapshot = overview.get("all-time");

    expect(snapshot.attempts.provider).toBe(0);
    expect(snapshot.tokenCoverage).toEqual({ reported: 0, unknown: 0 });
    expect(snapshot.tokens).toBeUndefined();
    expect(snapshot.costs).toEqual([]);
    expect(snapshot.buckets).toHaveLength(1);
  });

  it("uses the range index for bounded attempt reads", () => {
    const now = new Date(2026, 8, 1, 12).getTime();
    const { database } = openEnvironment(now);
    const plan = database.$client
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM provider_attempts WHERE started_at >= ? AND started_at < ?",
      )
      .all(now - 1_000, now) as Array<{ detail: string }>;

    expect(plan.some(({ detail }) => detail.includes("provider_attempts_started_at_idx"))).toBe(
      true,
    );
  });
});
