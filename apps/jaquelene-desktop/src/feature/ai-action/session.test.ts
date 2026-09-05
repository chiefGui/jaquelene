import type { AiActionRunner } from "@jaquelene/backend";
import { AiActionError } from "@jaquelene/backend";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { createAiActionSession } from "./session";

const input = { executionId: "one", target: "field", actionId: "write", text: "" };
const model = {
  providerId: "editor-provider",
  modelId: "editor-model",
  name: "Editor",
  brandId: "test",
};

function environment(run: AiActionRunner["run"] = () => Effect.succeed("New text")) {
  const runner = { list: () => [], run: vi.fn(run) };
  const diagnostics = { report: vi.fn() };
  const preferences = { getModel: vi.fn(() => model) };
  const session = createAiActionSession(
    runner,
    preferences,
    (effect, options) => Effect.runPromise(effect, options),
    diagnostics,
  );
  return { runner, preferences, diagnostics, session };
}

describe("AI action session", () => {
  it("uses the independently selected editor model", async () => {
    const { session, runner } = environment();
    await expect(session.run(input)).resolves.toEqual({ status: "completed", text: "New text" });
    expect(runner.run).toHaveBeenCalledWith({
      ...input,
      configuration: { model: { providerId: model.providerId, modelId: model.modelId } },
    });
  });

  it("requires a model without falling back to campaign settings", async () => {
    const run = vi.fn();
    const session = createAiActionSession(
      { list: () => [], run },
      { getModel: () => null },
      Effect.runPromise,
      { report: vi.fn() },
    );
    expect(await session.run(input)).toMatchObject({ status: "failed" });
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels before provider work starts and permits another operation afterwards", async () => {
    const execute = vi.fn();
    const { session } = environment(() =>
      Effect.sync(() => {
        execute();
        return "New text";
      }),
    );
    const result = session.run(input);
    await session.cancel(input.executionId);
    expect(await result).toEqual({ status: "cancelled" });
    expect(execute).not.toHaveBeenCalled();
    expect(await session.run({ ...input, executionId: "two" })).toEqual({
      status: "completed",
      text: "New text",
    });
  });

  it("waits for cancellation finalizers before acknowledging cancellation", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let released = false;
    const { session } = environment(() =>
      Effect.acquireUseRelease(
        Effect.sync(() => entered.resolve()),
        () => Effect.never,
        () =>
          Effect.promise(async () => {
            await release.promise;
            released = true;
          }),
      ),
    );
    const result = session.run(input);
    await entered.promise;
    const cancelled = session.cancel(input.executionId);
    expect(released).toBe(false);
    release.resolve();
    await cancelled;
    expect(released).toBe(true);
    expect(await result).toEqual({ status: "cancelled" });
  });

  it("bounds concurrent operations and rejects duplicate identities", async () => {
    const { session } = environment(() => Effect.never);
    const results = [session.run(input)];
    expect(await session.run(input)).toMatchObject({
      status: "failed",
      message: "This AI action is already running.",
    });
    for (let index = 2; index <= 4; index += 1) {
      results.push(session.run({ ...input, executionId: String(index) }));
    }
    expect(await session.run({ ...input, executionId: "overflow" })).toMatchObject({
      status: "failed",
    });
    session.close();
    expect(await Promise.all(results)).toEqual(
      Array.from({ length: 4 }, () => ({ status: "cancelled" })),
    );
    expect(await session.run({ ...input, executionId: "closed" })).toMatchObject({
      status: "failed",
      message: "This editor session has closed.",
    });
  });

  it("maps typed failures to useful messages and reports their causes", async () => {
    const error = new AiActionError({
      kind: "storage",
      message: "Could not record usage.",
      cause: new Error("Disk full"),
    });
    const { session, diagnostics } = environment(() => Effect.fail(error));
    expect(await session.run(input)).toEqual({ status: "failed", message: error.message });
    expect(diagnostics.report).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "ai-action.run", error }),
    );
  });

  it("cancels all operations on navigation without closing the next document's session", async () => {
    const { session } = environment(() => Effect.never);
    const first = session.run(input);
    session.cancelAll();
    expect(await first).toEqual({ status: "cancelled" });
    const second = session.run({ ...input, executionId: "next-page" });
    await session.cancel("next-page");
    expect(await second).toEqual({ status: "cancelled" });
  });
});
