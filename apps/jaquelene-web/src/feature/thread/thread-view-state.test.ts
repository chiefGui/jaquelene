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
    messageCountLimit: 50,
    messageMaxCodeUnits: 100_000,
    contentByteBudget: 128 * 1024,
    contentBytes: status === GenerationStatus.Completed ? 7 : 5,
  };
}

describe("thread view state", () => {
  it("tracks pending replies without adding inline message state", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Pending)],
      retryActivity: null,
      hasModel: true,
    });

    expect(state.messages).toEqual([
      expect.objectContaining({
        fromUser: true,
        replyFailure: null,
      }),
    ]);
    expect(state.latestMessageId).toBe("message-user");
    expect(state.replyPending).toBe(true);
  });

  it("renders completed assistant output without a separate activity item", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      retryActivity: null,
      hasModel: true,
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages.every(({ replyFailure }) => replyFailure === null)).toBe(true);
    expect(state.replyPending).toBe(false);
  });

  it("keeps failed reply recovery adjacent to its user turn", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Failed)],
      retryActivity: { turnId: "turn", status: "failed" },
      hasModel: true,
    });

    expect(state.messages[0]?.replyFailure).toEqual(
      expect.objectContaining({
        canRetry: true,
        retryFailed: true,
      }),
    );
  });
});
