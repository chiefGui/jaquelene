import { Effect } from "effect";
import { ids, PlayerResponseError } from "@jaquelene/backend";
import { skillIdSchema } from "@jaquelene/domain";
import { describe, expect, it, vi } from "vite-plus/test";
import { createPlayerResponseExecutions } from "./executions";

const request = {
  threadId: ids.thread.create(),
  skillId: skillIdSchema.parse("friendly-response"),
  configuration: { model: { providerId: "test", modelId: "model" } },
};

describe("player response execution ownership", () => {
  it("cancels the owned request before any start acknowledgment and allows retry", async () => {
    const executions = createPlayerResponseExecutions(
      { execute: () => Effect.never },
      Effect.runFork,
      vi.fn(),
    );
    const pending = executions.execute("first", request);
    expect(executions.cancel("another-window")).toBe(false);
    expect(executions.cancel("first")).toBe(true);
    expect(await pending).toEqual({ status: "cancelled" });
    const next = executions.execute("second", request);
    executions.close();
    expect(await next).toEqual({ status: "cancelled" });
    expect(() => executions.execute("third", request)).toThrow("closed");
  });

  it("prevents overlapping runs and releases ownership after success", async () => {
    const response = Promise.withResolvers<{ text: string }>();
    const executions = createPlayerResponseExecutions(
      { execute: () => Effect.promise(() => response.promise) },
      Effect.runFork,
      vi.fn(),
    );
    const pending = executions.execute("first", request);
    expect(() => executions.execute("second", request)).toThrow("already running");
    response.resolve({ text: "Draft" });
    expect(await pending).toEqual({ status: "completed", text: "Draft" });
    expect(await executions.execute("third", request)).toEqual({
      status: "completed",
      text: "Draft",
    });
    executions.close();
  });

  it.each([
    {
      kind: "provider",
      failure: new Error("Provider internals"),
      message: "Could not generate a response.",
    },
    {
      kind: "player response",
      failure: new PlayerResponseError({
        message: "The conversation changed. Generate a new response.",
      }),
      message: "The conversation changed. Generate a new response.",
    },
  ])("reports $kind failures with the appropriate public message", async ({ failure, message }) => {
    const report = vi.fn();
    const executions = createPlayerResponseExecutions(
      { execute: () => Effect.fail(failure) },
      Effect.runFork,
      report,
    );
    expect(await executions.execute("first", request)).toEqual({
      status: "failed",
      message,
    });
    expect(report).toHaveBeenCalledWith(failure);
    executions.close();
  });
});
