import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ProviderAccounting } from "#backend/provider/accounting";
import { createProviderAttempts, settleProviderAttemptInTransaction } from "./provider-attempts";
import { providerAttemptTable } from "./schema";

const databases: Database[] = [];

function openEnvironment() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const changed = vi.fn();
  return { database, changed, attempts: createProviderAttempts(database, changed) };
}

function request(executionId = "execution-1") {
  return {
    executionId,
    providerId: "provider-a",
    requestedModelId: "maker/model",
    startedAt: 100,
  };
}

const accounting: ProviderAccounting = {
  providerGenerationId: "provider-result-1",
  resolvedModelId: "maker/model-v2",
  upstreamProviderId: "upstream-a",
  finishReason: "stop",
  usage: {
    tokens: { input: { total: 10, cacheRead: 3 }, output: { total: 4, reasoning: 2 }, total: 14 },
    cost: { currency: "USD", amountNanos: 25_000, source: "provider-reported" },
  },
};

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }
});

describe("provider attempts", () => {
  it("records an independent execution and settles its accounting exactly once", () => {
    const { database, attempts, changed } = openEnvironment();
    const pending = attempts.start(request());

    expect(pending).toMatchObject({
      executionId: "execution-1",
      attributionKind: null,
      attributionId: null,
      status: "pending",
      finishedAt: null,
    });
    expect(changed).toHaveBeenCalledOnce();

    const completed = attempts.settle(pending.id, {
      status: "completed",
      finishedAt: 101,
      accounting,
    });
    expect(completed).toMatchObject({
      id: pending.id,
      executionId: pending.executionId,
      status: "completed",
      failureKind: null,
      finishedAt: 101,
      providerGenerationId: "provider-result-1",
      resolvedModelId: "maker/model-v2",
      upstreamProviderId: "upstream-a",
      finishReason: "stop",
      inputTokens: 10,
      cacheReadInputTokens: 3,
      cacheWriteInputTokens: null,
      outputTokens: 4,
      reasoningOutputTokens: 2,
      totalTokens: 14,
      costCurrency: "USD",
      costAmountNanos: 25_000,
      costSource: "provider-reported",
    });
    expect(changed).toHaveBeenCalledTimes(2);

    expect(() =>
      attempts.settle(pending.id, {
        status: "failed",
        failureKind: "interrupted",
        finishedAt: 102,
      }),
    ).toThrow("no longer pending");
    expect(database.select().from(providerAttemptTable).all()).toEqual([completed]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("accepts caller-owned attribution and distinct attempts for the same execution", () => {
    const { attempts } = openEnvironment();
    const input = { ...request(), attribution: { kind: "document", id: "document-1" } };
    const first = attempts.start(input);
    const second = attempts.start(input);

    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({
      executionId: input.executionId,
      attributionKind: input.attribution.kind,
      attributionId: input.attribution.id,
    });
    expect(second.executionId).toBe(first.executionId);
  });

  it.each(["provider", "interrupted"] as const)(
    "settles a %s failure without inventing usage",
    (failureKind) => {
      const { attempts, changed } = openEnvironment();
      const pending = attempts.start(request());
      const failed = attempts.settle(pending.id, {
        status: "failed",
        failureKind,
        finishedAt: 101,
      });

      expect(failed).toMatchObject({
        status: "failed",
        failureKind,
        finishedAt: 101,
        totalTokens: null,
        costAmountNanos: null,
      });
      expect(changed).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves the pending record and emits no change when settlement cannot be stored", () => {
    const { database, attempts, changed } = openEnvironment();
    const pending = attempts.start(request());
    changed.mockClear();

    expect(() =>
      attempts.settle(pending.id, {
        status: "completed",
        finishedAt: 99,
        accounting,
      }),
    ).toThrow();
    expect(() =>
      attempts.settle(ids.providerAttempt.create(), {
        status: "completed",
        finishedAt: 101,
        accounting,
      }),
    ).toThrow("no longer pending");
    expect(database.select().from(providerAttemptTable).all()).toEqual([pending]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("rolls back accounting with the consumer transaction", () => {
    const { database, attempts, changed } = openEnvironment();
    const pending = attempts.start(request());
    changed.mockClear();

    expect(() =>
      database.transaction((transaction) => {
        settleProviderAttemptInTransaction(transaction, pending.id, {
          status: "completed",
          finishedAt: 101,
          accounting,
        });
        throw new Error("Consumer settlement failed.");
      }),
    ).toThrow("Consumer settlement failed.");

    expect(database.select().from(providerAttemptTable).all()).toEqual([pending]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("recovers all pending attempts without rewriting settled accounting or regressing time", () => {
    const { database, attempts, changed } = openEnvironment();
    const first = attempts.start(request());
    const attributed = attempts.start({
      ...request("execution-2"),
      attribution: { kind: "document", id: "document-1" },
      startedAt: 300,
    });
    const settled = attempts.start(request("execution-3"));
    const completed = attempts.settle(settled.id, {
      status: "completed",
      finishedAt: 101,
      accounting,
    });
    changed.mockClear();

    attempts.recoverInterrupted(200);

    expect(database.select().from(providerAttemptTable).all()).toEqual([
      { ...first, status: "failed", failureKind: "interrupted", finishedAt: 200 },
      { ...attributed, status: "failed", failureKind: "interrupted", finishedAt: 300 },
      completed,
    ]);
    expect(changed).toHaveBeenCalledOnce();
    attempts.recoverInterrupted(400);
    expect(changed).toHaveBeenCalledOnce();
    expect(() =>
      attempts.settle(first.id, { status: "completed", finishedAt: 401, accounting }),
    ).toThrow("no longer pending");
  });

  it("indexes execution lookup, attribution filtering, and pending recovery", () => {
    const { database } = openEnvironment();
    const queries = [
      [
        "SELECT id FROM provider_attempts WHERE execution_id = 'execution-1'",
        "provider_attempts_execution_idx",
      ],
      [
        "SELECT id FROM provider_attempts WHERE attribution_kind = 'campaign' AND attribution_id = 'campaign-1' AND started_at >= 100",
        "provider_attempts_attribution_started_at_idx",
      ],
      [
        "SELECT id FROM provider_attempts WHERE status = 'pending' LIMIT 1",
        "provider_attempts_pending_idx",
      ],
    ] as const;

    for (const [query, index] of queries) {
      const plan = database.$client.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
      expect(plan.some(({ detail }) => String(detail).includes(index))).toBe(true);
    }
  });
});
