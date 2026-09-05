import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { closeDatabase, openDatabase } from "#backend/database/database";
import { ModelProviderError, type Inference, type InferenceResult } from "#backend/model/inference";
import { normalizeProviderAccounting } from "#backend/provider/accounting";
import { createProviderAttempts } from "#backend/usage/provider-attempts";
import { providerAttemptTable } from "#backend/usage/schema";
import type { AiActionDefinition } from "./definition";
import { createAiActionRunner, type RunAiActionRequest } from "./runner";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup();
  }
});

const action: AiActionDefinition = {
  id: "revise",
  label: "Revise",
  requiresText: true,
  prepare: (text) => ({
    instructions: [{ sourceKey: "guidance", content: "Revise this text." }],
    dialogue: [{ sourceKey: "input", role: "user", content: text }],
  }),
  parseResult(text) {
    if (!text.trim()) {
      throw new TypeError("Empty output");
    }
    return text;
  },
};
const request: RunAiActionRequest = {
  executionId: "execution-1",
  target: "first-field",
  actionId: action.id,
  text: "Input",
  configuration: { model: { providerId: "test", modelId: "model" } },
};

function completed(text = "Revised text"): InferenceResult {
  const normalized = normalizeProviderAccounting({
    text,
    usage: { tokens: { input: { total: 3 }, output: { total: 2 }, total: 5 } },
  });
  return { outcome: "completed", text, accounting: normalized.accounting };
}

function environment(execution: ReturnType<Inference["execute"]> = Effect.succeed(completed())) {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-ai-actions-"));
  const database = openDatabase(join(directory, "content.sqlite"));
  cleanups.push(() => {
    closeDatabase(database);
    rmSync(directory, { recursive: true, force: true });
  });
  const changed = vi.fn();
  const attempts = createProviderAttempts(database, changed);
  const inference: Inference = {
    resolveConfiguration: vi.fn((configuration) => Effect.succeed(configuration)),
    execute: vi.fn(() => execution),
  };
  const runner = createAiActionRunner(
    [
      { target: "first-field", actions: [action] },
      {
        target: "second-field",
        actions: [
          action,
          {
            ...action,
            id: "exclusive",
            label: "Exclusive",
            prepare: () => ({
              instructions: [{ sourceKey: "guidance", content: "Second field only." }],
              dialogue: [],
            }),
          },
        ],
      },
    ],
    inference,
    attempts,
  );
  return { database, inference, attempts, runner, changed };
}

describe("AI action runner", () => {
  it("runs shared and exclusive definitions without changing execution", async () => {
    const { runner, inference, database } = environment();
    expect(runner.list("first-field")).toEqual([
      { id: "revise", label: "Revise", requiresText: true },
    ]);
    expect(runner.list("second-field")).toHaveLength(2);
    expect(runner.list("unknown")).toEqual([]);
    await expect(Effect.runPromise(runner.run(request))).resolves.toBe("Revised text");
    await Effect.runPromise(
      runner.run({
        ...request,
        executionId: "execution-2",
        target: "second-field",
        actionId: "exclusive",
      }),
    );
    expect(inference.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          instructions: [{ sourceKey: "guidance", content: "Second field only." }],
          dialogue: [],
        },
      }),
    );
    expect(database.select().from(providerAttemptTable).all()).toEqual([
      expect.objectContaining({
        status: "completed",
        totalTokens: 5,
        attributionKind: "ai-action",
        attributionId: "first-field/revise",
      }),
      expect.objectContaining({
        status: "completed",
        totalTokens: 5,
        attributionKind: "ai-action",
        attributionId: "second-field/exclusive",
      }),
    ]);
  });

  it("rejects unavailable, blank, and oversized inputs before invoking a model", async () => {
    const { runner, inference, database } = environment();
    for (const invalid of [
      { ...request, actionId: "exclusive" },
      { ...request, text: " \n " },
      { ...request, text: "x".repeat(40_001) },
    ]) {
      const failure = await Effect.runPromise(Effect.flip(runner.run(invalid)));
      expect(failure.kind).toBe("input");
    }
    expect(inference.resolveConfiguration).not.toHaveBeenCalled();
    expect(inference.execute).not.toHaveBeenCalled();
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
  });

  it("records usage even when consumer result validation fails", async () => {
    const { runner, database } = environment(Effect.succeed(completed(" ")));
    expect((await Effect.runPromise(Effect.flip(runner.run(request)))).kind).toBe("output");
    expect(database.select().from(providerAttemptTable).get()).toMatchObject({
      status: "completed",
      totalTokens: 5,
    });
  });

  it("preserves available accounting when a provider returns invalid accounting", async () => {
    const { runner, database } = environment(
      Effect.succeed({
        outcome: "invalid-accounting",
        cause: new Error("Invalid tokens"),
        accounting: completed().accounting,
      }),
    );
    expect((await Effect.runPromise(Effect.flip(runner.run(request)))).kind).toBe("accounting");
    expect(database.select().from(providerAttemptTable).get()).toMatchObject({
      status: "completed",
      totalTokens: 5,
    });
  });

  it("settles provider failures", async () => {
    const { runner, database } = environment(
      Effect.fail(new ModelProviderError({ cause: new Error("Offline") })),
    );
    expect((await Effect.runPromise(Effect.flip(runner.run(request)))).kind).toBe("provider");
    expect(database.select().from(providerAttemptTable).get()).toMatchObject({
      status: "failed",
      failureKind: "provider",
    });
  });

  it("cancels the provider and settles the attempt before cancellation completes", async () => {
    const entered = Promise.withResolvers<void>();
    const aborted = vi.fn();
    const { runner, database } = environment(
      Effect.tryPromise({
        try: (signal) =>
          new Promise<InferenceResult>(() => {
            signal.addEventListener("abort", aborted, { once: true });
            entered.resolve();
          }),
        catch: (cause) => new ModelProviderError({ cause }),
      }),
    );
    const controller = new AbortController();
    const running = Effect.runPromiseExit(runner.run(request), { signal: controller.signal });
    await entered.promise;
    controller.abort();
    await running;
    expect(aborted).toHaveBeenCalledOnce();
    expect(database.select().from(providerAttemptTable).get()).toMatchObject({
      status: "failed",
      failureKind: "interrupted",
    });
  });

  it("does not return text if usage settlement fails", async () => {
    const { attempts, inference } = environment();
    const runner = createAiActionRunner([{ target: "first-field", actions: [action] }], inference, {
      ...attempts,
      settle: () => {
        throw new Error("Disk full");
      },
    });
    expect((await Effect.runPromise(Effect.flip(runner.run(request)))).kind).toBe("storage");
  });

  it("rejects duplicate registrations and owns descriptor snapshots", () => {
    const { attempts, inference, runner } = environment();
    expect(() =>
      createAiActionRunner(
        [
          { target: "same", actions: [] },
          { target: "same", actions: [] },
        ],
        inference,
        attempts,
      ),
    ).toThrow("Duplicate AI action target");
    expect(() =>
      createAiActionRunner([{ target: "same", actions: [action, action] }], inference, attempts),
    ).toThrow("Duplicate AI action");
    const descriptors = runner.list("first-field");
    Object.assign(descriptors[0]!, { label: "Changed" });
    expect(runner.list("first-field")[0]?.label).toBe("Revise");
  });
});
