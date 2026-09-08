import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Cause, Effect, Exit } from "effect";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { createProviderAttempts } from "#backend/usage/provider-attempts";
import { providerAttemptTable } from "#backend/usage/schema";
import { createAccountedModelExecution } from "./accounted-execution";
import type { ModelExecutionRequest } from "./execution";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) closeDatabase(database);
});
const request: ModelExecutionRequest = {
  executionId: "skill-run",
  configuration: { model: { providerId: "test", modelId: "model" } },
  input: { instructions: [{ sourceKey: "skill", content: "Generate a draft" }], dialogue: [] },
};
const attribution = { kind: "campaign", id: "campaign-id" };

function environment() {
  const database = openDatabase(":memory:");
  databases.push(database);
  return { database, attempts: createProviderAttempts(database, () => {}) };
}

describe("accounted model execution", () => {
  it("preserves available accounting when the provider response has invalid accounting", async () => {
    const { database, attempts } = environment();
    const failure = new Error("Invalid usage");
    const execute = createAccountedModelExecution(
      {
        execute: () =>
          Effect.succeed({
            outcome: "invalid-accounting",
            cause: failure,
            accounting: {
              providerGenerationId: "provider-run",
              resolvedModelId: "resolved-model",
              upstreamProviderId: null,
              finishReason: "stop",
              usage: null,
            },
          }),
      },
      attempts,
    );
    await expect(Effect.runPromise(execute(request, attribution))).rejects.toThrow("Invalid usage");
    expect(database.select().from(providerAttemptTable).all()).toMatchObject([
      {
        status: "completed",
        providerGenerationId: "provider-run",
        resolvedModelId: "resolved-model",
        totalTokens: null,
      },
    ]);
  });

  it("does not hide a settlement failure behind cancellation", async () => {
    const { attempts } = environment();
    const started = Promise.withResolvers<void>();
    const execute = createAccountedModelExecution(
      { execute: () => Effect.sync(() => started.resolve()).pipe(Effect.andThen(Effect.never)) },
      {
        start: attempts.start,
        settle: () => {
          throw new Error("Could not settle usage");
        },
      },
    );
    const controller = new AbortController();
    const running = Effect.runPromiseExit(execute(request, attribution), {
      signal: controller.signal,
    });
    await started.promise;
    controller.abort();
    const exit = await running;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(false);
      expect(Cause.squash(exit.cause)).toBeInstanceOf(AggregateError);
    }
  });

  it("validates input before creating a billable attempt", async () => {
    const { database, attempts } = environment();
    const provider = vi.fn(() => Effect.die("Must not run"));
    const execute = createAccountedModelExecution({ execute: provider }, attempts);
    await expect(
      Effect.runPromise(
        execute(
          {
            ...request,
            input: { instructions: [{ sourceKey: "bad", content: "" }], dialogue: [] },
          },
          attribution,
        ),
      ),
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
  });
});
