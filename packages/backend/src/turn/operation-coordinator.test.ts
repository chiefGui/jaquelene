import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { createTurnOperationCoordinator } from "./operation-coordinator";

describe("turn operation coordinator", () => {
  it("owns one explicit lifecycle per thread without stale releases", () => {
    const coordinator = createTurnOperationCoordinator();
    const threadId = ids.thread.create();
    const turnId = ids.turn.create();
    const generationId = ids.generation.create();

    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
    const submission = coordinator.acquire(threadId, { state: "submitting" });
    expect(coordinator.inspect(threadId)).toEqual({ state: "submitting" });
    expect(() => coordinator.acquire(threadId, { state: "retrying", turnId })).toThrow(
      `Thread "${threadId}" already has an active turn operation.`,
    );

    submission.generating(turnId, generationId);
    expect(coordinator.inspect(threadId)).toEqual({
      state: "generating",
      source: "submit",
      turnId,
      generationId,
    });
    expect(() => submission.generating(turnId, generationId)).toThrow(
      `Thread "${threadId}" operation is already generating.`,
    );

    submission.release();
    const retry = coordinator.acquire(threadId, { state: "retrying", turnId });
    submission.release();
    expect(coordinator.inspect(threadId)).toEqual({ state: "retrying", turnId });

    retry.release();
    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
  });

  it("makes truncation an inspectable exclusive operation that cannot generate", () => {
    const coordinator = createTurnOperationCoordinator();
    const threadId = ids.thread.create();
    const userMessageId = ids.message.create();
    const truncation = coordinator.acquire(threadId, { state: "truncating", userMessageId });

    expect(coordinator.inspect(threadId)).toEqual({ state: "truncating", userMessageId });
    expect(() => coordinator.acquire(threadId, { state: "submitting" })).toThrow(
      `Thread "${threadId}" already has an active turn operation.`,
    );
    expect(truncation).not.toHaveProperty("generating");

    truncation.release();
    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
  });
});
