import {
  GenerationFailureKind,
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessagePage,
} from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import { deriveThreadViewState } from "./thread-view-state";

function page(status: GenerationStatus): ThreadMessagePage {
  const userMessage = {
    id: "message-user",
    threadId: "thread",
    turnId: "turn",
    sequence: 1,
    author: ThreadMessageAuthor.User,
    content: "Hello",
    createdAt: 1,
  };

  return {
    messages:
      status === GenerationStatus.Completed
        ? [
            userMessage,
            {
              id: "message-assistant",
              threadId: "thread",
              turnId: "turn",
              sequence: 2,
              author: ThreadMessageAuthor.Assistant,
              content: "Hi",
              createdAt: 2,
            },
          ]
        : [userMessage],
    generations: [
      {
        id: "generation",
        turnId: "turn",
        providerId: "provider",
        modelId: "model",
        status,
        ...(status === GenerationStatus.Failed
          ? {
              failureKind: GenerationFailureKind.Provider,
              finishedAt: 2,
            }
          : {}),
        ...(status === GenerationStatus.Completed
          ? {
              outputMessageId: "message-assistant",
              finishedAt: 2,
            }
          : {}),
        startedAt: 1,
      },
    ],
    pageSize: 50,
    messageContentMaxLength: 100_000,
  };
}

describe("thread view state", () => {
  it("places pending reply activity after the user message", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Pending)],
      retryActivity: null,
      hasModel: true,
    });

    expect(state.items).toEqual([
      expect.objectContaining({ kind: "message", fromUser: true }),
      expect.objectContaining({
        kind: "reply",
        latest: true,
        generation: expect.objectContaining({ status: GenerationStatus.Pending }),
      }),
    ]);
    expect(state.replyPending).toBe(true);
  });

  it("renders completed assistant output without a separate activity item", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      retryActivity: null,
      hasModel: true,
    });

    expect(state.items.map(({ kind }) => kind)).toEqual(["message", "message"]);
    expect(state.replyPending).toBe(false);
  });

  it("keeps failed reply recovery adjacent to its user turn", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Failed)],
      retryActivity: { turnId: "turn", status: "failed" },
      hasModel: true,
    });

    expect(state.items[1]).toEqual(
      expect.objectContaining({
        kind: "reply",
        latest: true,
        canRetry: true,
        retryFailed: true,
      }),
    );
  });
});
