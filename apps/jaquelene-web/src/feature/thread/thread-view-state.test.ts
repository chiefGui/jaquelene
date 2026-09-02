import {
  GenerationFailureKind,
  GenerationKind,
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
        kind: GenerationKind.Reply,
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
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages).toEqual([
      expect.objectContaining({
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
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages.every(({ replyFailure }) => replyFailure === null)).toBe(true);
    expect(state.messages[1]?.regeneration).toEqual({
      status: "available",
      canRegenerate: true,
    });
    expect(state.replyPending).toBe(false);
  });

  it("keeps failed reply recovery adjacent to its user turn", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Failed)],
      retryActivity: { turnId: "turn", status: "failed" },
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages[0]?.replyFailure).toEqual(
      expect.objectContaining({
        canRetry: true,
        retryFailed: true,
      }),
    );
  });

  it("keeps the current assistant response visible while regeneration is pending", () => {
    const current = page(GenerationStatus.Completed);
    const generation = current.generations[0]!;
    const pendingPage: ThreadMessagePage = {
      ...current,
      generations: [
        {
          id: "generation-regeneration",
          turnId: generation.turnId,
          kind: GenerationKind.Regeneration,
          providerId: generation.providerId,
          modelId: generation.modelId,
          status: GenerationStatus.Pending,
          startedAt: 3,
        },
      ],
    };
    const state = deriveThreadViewState({
      pages: [pendingPage],
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.replyFailure).toBeNull();
    expect(state.messages[1]?.regeneration).toEqual({
      status: "pending",
      canRegenerate: false,
    });
    expect(state.replyPending).toBe(true);
  });

  it("attaches failed regeneration to the retained assistant response", () => {
    const current = page(GenerationStatus.Completed);
    const generation = current.generations[0]!;
    const failedPage: ThreadMessagePage = {
      ...current,
      generations: [
        {
          id: "generation-regeneration",
          turnId: generation.turnId,
          kind: GenerationKind.Regeneration,
          providerId: generation.providerId,
          modelId: generation.modelId,
          status: GenerationStatus.Failed,
          failureKind: GenerationFailureKind.Provider,
          startedAt: 3,
          finishedAt: 4,
        },
      ],
    };
    const state = deriveThreadViewState({
      pages: [failedPage],
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages[0]?.replyFailure).toBeNull();
    expect(state.messages[1]?.regeneration).toEqual({
      status: "failed",
      canRegenerate: true,
    });
    expect(state.replyPending).toBe(false);
  });

  it("does not expose regeneration while viewing historical pages", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      retryActivity: null,
      actionsAvailable: false,
      hasModel: true,
    });

    expect(state.messages[1]?.regeneration).toBeNull();
  });
});
