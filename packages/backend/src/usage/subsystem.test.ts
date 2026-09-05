import { Cause, Layer, Logger, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, DatabaseService, openDatabase } from "#backend/database/database";
import type { ProviderAccounting } from "#backend/provider/accounting";
import { providerAttemptTable } from "./schema";
import { UsageService } from "./subsystem";

const closeEnvironments: Array<() => Promise<void>> = [];

async function openEnvironment() {
  const database = openDatabase(":memory:");
  const log = vi.fn<Logger.Logger<unknown, void>["log"]>();
  const runtime = ManagedRuntime.make(
    UsageService.layer.pipe(
      Layer.provide(
        Layer.merge(Layer.succeed(DatabaseService, database), Logger.layer([Logger.make(log)])),
      ),
    ),
  );
  closeEnvironments.push(async () => {
    await runtime.dispose();
    closeDatabase(database);
  });
  const usage = await runtime.runPromise(UsageService);
  return { database, log, runtime, usage };
}

const accounting: ProviderAccounting = {
  providerGenerationId: null,
  resolvedModelId: null,
  upstreamProviderId: null,
  finishReason: null,
  usage: null,
};

function request(executionId = "execution-1") {
  return { executionId, providerId: "provider-a", requestedModelId: "maker/model", startedAt: 100 };
}

afterEach(async () => {
  for (const close of closeEnvironments.splice(0)) {
    await close();
  }
});

describe("usage notifications", () => {
  it("isolates and logs subscriber failures without changing ledger results", async () => {
    const { database, log, usage } = await openEnvironment();
    const failure = new Error("Subscriber failed.");
    const broken = vi.fn(() => {
      throw failure;
    });
    const healthy = vi.fn();
    usage.subscribe(broken);
    usage.subscribe(healthy);

    const attempt = usage.attempts.start(request());
    expect(attempt.status).toBe("pending");
    expect(broken).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        logLevel: "Error",
        message: ["Usage subscriber failed."],
        cause: Cause.die(failure),
      }),
    );

    const settled = usage.attempts.settle(attempt.id, {
      status: "completed",
      finishedAt: 101,
      accounting,
    });
    expect(settled.status).toBe("completed");
    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(2));
    expect(broken).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);
    expect(database.select().from(providerAttemptTable).get()).toEqual(settled);

    expect(usage.clear()).toEqual({ deletedAttempts: 1 });
    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(3));
    expect(log).toHaveBeenCalledTimes(3);
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
  });

  it("preserves failure settlement and interrupted recovery when a subscriber throws", async () => {
    const { database, log, usage } = await openEnvironment();
    usage.subscribe(() => {
      throw new Error("Subscriber failed.");
    });
    const failed = usage.attempts.start(request("failed-execution"));
    expect(
      usage.attempts.settle(failed.id, {
        status: "failed",
        failureKind: "provider",
        finishedAt: 101,
      }),
    ).toMatchObject({ status: "failed", failureKind: "provider" });
    usage.attempts.start(request("interrupted-execution"));
    expect(() => usage.attempts.recoverInterrupted(102)).not.toThrow();

    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(
      database
        .select({
          status: providerAttemptTable.status,
          failureKind: providerAttemptTable.failureKind,
        })
        .from(providerAttemptTable)
        .all(),
    ).toEqual([
      { status: "failed", failureKind: "provider" },
      { status: "failed", failureKind: "interrupted" },
    ]);
    expect(usage.clear()).toEqual({ deletedAttempts: 2 });
  });

  it("bounds queued invalidations and stops delivery when unsubscribed", async () => {
    const { usage } = await openEnvironment();
    const changed = vi.fn();
    const unsubscribe = usage.subscribe(changed);
    for (let index = 0; index < 100; index += 1) {
      usage.attempts.changed();
    }
    expect(changed).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(changed.mock.calls.length).toBeLessThanOrEqual(2);

    changed.mockClear();
    usage.attempts.changed();
    unsubscribe();
    unsubscribe();
    const next = vi.fn();
    usage.subscribe(next);
    usage.attempts.changed();
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps slow and rejecting async subscribers independent", async () => {
    const { log, usage } = await openEnvironment();
    const pending = Promise.withResolvers<void>();
    const slow = vi.fn(() => pending.promise);
    const failure = new Error("Async subscriber failed.");
    usage.subscribe(slow);
    usage.subscribe(async () => {
      throw failure;
    });
    const healthy = vi.fn();
    usage.subscribe(healthy);
    usage.attempts.changed();
    await vi.waitFor(() => {
      expect(healthy).toHaveBeenCalledOnce();
      expect(slow).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledOnce();
    });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ cause: Cause.die(failure) }));

    for (let index = 0; index < 100; index += 1) {
      usage.attempts.changed();
    }
    await vi.waitFor(() => expect(healthy.mock.calls.length).toBeGreaterThan(1));
    expect(slow).toHaveBeenCalledOnce();
    const receivedBeforeNextChange = healthy.mock.calls.length;
    usage.attempts.changed();
    await vi.waitFor(() =>
      expect(healthy.mock.calls.length).toBeGreaterThan(receivedBeforeNextChange),
    );
    expect(slow).toHaveBeenCalledOnce();
    pending.resolve();
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(2));
  });

  it("stops queued subscribers when the usage scope closes", async () => {
    const { runtime, usage } = await openEnvironment();
    const changed = vi.fn();
    const unsubscribe = usage.subscribe(changed);
    usage.attempts.changed();
    await runtime.dispose();
    const callsAfterClose = changed.mock.calls.length;

    usage.attempts.changed();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(changed).toHaveBeenCalledTimes(callsAfterClose);
    unsubscribe();
  });

  it("closes without waiting for an uncooperative subscriber or logging interruption", async () => {
    const { log, runtime, usage } = await openEnvironment();
    const changed = vi.fn(() => new Promise<void>(() => {}));
    usage.subscribe(changed);
    usage.attempts.changed();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

    await runtime.dispose();
    expect(log).not.toHaveBeenCalled();
    usage.attempts.changed();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(changed).toHaveBeenCalledOnce();
  });
});
