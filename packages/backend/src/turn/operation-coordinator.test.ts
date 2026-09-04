import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { createThreadOperationCoordinator } from "./operation-coordinator";

describe("thread operation coordinator", () => {
  it("owns one explicit lifecycle per thread without stale releases", () => {
    const coordinator = createThreadOperationCoordinator();
    const threadId = ids.thread.create();
    const turnId = ids.turn.create();
    const generationId = ids.generation.create();

    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
    const submission = coordinator.acquire(threadId, { state: "submitting" });
    expect(coordinator.inspect(threadId)).toEqual({ state: "submitting" });
    expect(() => coordinator.acquire(threadId, { state: "retrying", turnId })).toThrow(
      `Thread "${threadId}" already has an active operation.`,
    );

    submission.generating(turnId, generationId, "reply");
    expect(coordinator.inspect(threadId)).toEqual({
      state: "generating",
      intent: "reply",
      turnId,
      generationId,
    });
    expect(() => submission.generating(turnId, generationId, "reply")).toThrow(
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
    const coordinator = createThreadOperationCoordinator();
    const threadId = ids.thread.create();
    const messageId = ids.message.create();
    const truncation = coordinator.acquire(threadId, { state: "truncating", messageId });

    expect(coordinator.inspect(threadId)).toEqual({ state: "truncating", messageId });
    expect(() => coordinator.acquire(threadId, { state: "submitting" })).toThrow(
      `Thread "${threadId}" already has an active operation.`,
    );
    expect(truncation).not.toHaveProperty("generating");

    truncation.release();
    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
  });

  it("makes editing an inspectable exclusive operation that cannot generate", () => {
    const coordinator = createThreadOperationCoordinator();
    const threadId = ids.thread.create();
    const messageId = ids.message.create();
    const editing = coordinator.acquire(threadId, { state: "editing", messageId });

    expect(coordinator.inspect(threadId)).toEqual({ state: "editing", messageId });
    expect(() => coordinator.acquire(threadId, { state: "submitting" })).toThrow(
      `Thread "${threadId}" already has an active operation.`,
    );
    expect(editing).not.toHaveProperty("generating");

    editing.release();
    expect(coordinator.inspect(threadId)).toEqual({ state: "idle" });
  });
});
