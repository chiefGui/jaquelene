import {
  GenerationFailureKind,
  GenerationIntent,
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
        threadId: "thread",
        turnId: "turn",
        intent: GenerationIntent.Reply,
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
  it("allows opening regeneration to choose a model when the campaign has none", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      regenerationRequestMessageId: null,
      retryActivity: null,
      actionsAvailable: true,
      hasModel: false,
    });
    expect(state.messages[1]?.regeneration).toEqual({ status: "available", canRegenerate: true });
  });

  it("allows regenerating narration that has no generation record", () => {
    const current = page(GenerationStatus.Completed);
    const state = deriveThreadViewState({
      pages: [{ ...current, generations: [] }],
      regenerationRequestMessageId: null,
      retryActivity: null,
      actionsAvailable: true,
      hasModel: false,
    });
    expect(state.messages[1]?.regeneration).toEqual({ status: "available", canRegenerate: true });
    expect(state.messages[0]?.regeneration).toBeNull();
    expect(state.pendingGenerationIntent).toBeNull();
  });

  it("tracks pending replies without adding inline message state", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Pending)],
      regenerationRequestMessageId: null,
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
    expect(state.pendingGenerationIntent).toBe(GenerationIntent.Reply);
  });

  it("renders completed assistant output without a separate activity item", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      regenerationRequestMessageId: null,
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
    expect(state.pendingGenerationIntent).toBeNull();
  });

  it("keeps failed reply recovery adjacent to its user turn", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Failed)],
      regenerationRequestMessageId: null,
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
          threadId: generation.threadId,
          turnId: generation.turnId,
          intent: GenerationIntent.Regeneration,
          providerId: generation.providerId,
          modelId: generation.modelId,
          status: GenerationStatus.Pending,
          startedAt: 3,
        },
      ],
    };
    const state = deriveThreadViewState({
      pages: [pendingPage],
      regenerationRequestMessageId: null,
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
    expect(state.pendingGenerationIntent).toBe(GenerationIntent.Regeneration);
  });

  it("attaches failed regeneration to the retained assistant response", () => {
    const current = page(GenerationStatus.Completed);
    const generation = current.generations[0]!;
    const failedPage: ThreadMessagePage = {
      ...current,
      generations: [
        {
          id: "generation-regeneration",
          threadId: generation.threadId,
          turnId: generation.turnId,
          intent: GenerationIntent.Regeneration,
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
      regenerationRequestMessageId: null,
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages[0]?.replyFailure).toBeNull();
    expect(state.messages[1]?.regeneration).toEqual({
      status: "failed",
      canRegenerate: true,
    });
    expect(state.pendingGenerationIntent).toBeNull();
  });

  it("does not expose regeneration while viewing historical pages", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      regenerationRequestMessageId: null,
      retryActivity: null,
      actionsAvailable: false,
      hasModel: true,
    });

    expect(state.messages[1]?.regeneration).toBeNull();
  });

  it("targets the retained response while the regeneration request is being accepted", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Completed)],
      regenerationRequestMessageId: "message-assistant",
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages[0]?.regeneration).toBeNull();
    expect(state.messages[1]?.regeneration).toEqual({ status: "pending", canRegenerate: false });
    expect(state.pendingGenerationIntent).toBeNull();
  });

  it("restores regeneration availability when its request fails before acceptance", () => {
    const input = {
      pages: [page(GenerationStatus.Completed)],
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    };

    const pending = deriveThreadViewState({
      ...input,
      regenerationRequestMessageId: "message-assistant",
    });
    const failed = deriveThreadViewState({ ...input, regenerationRequestMessageId: null });

    expect(pending.messages[1]?.regeneration?.status).toBe("pending");
    expect(failed.messages[1]?.regeneration).toEqual({ status: "available", canRegenerate: true });
    expect(failed.messages[1]?.message).toEqual(pending.messages[1]?.message);
  });

  it("does not apply a settling request to a replacement response", () => {
    const current = page(GenerationStatus.Completed);
    const messages = current.messages.map((message) => {
      if (message.id === "message-assistant") {
        return { ...message, id: "replacement" };
      }
      return message;
    });
    const generations = current.generations.map((generation) => ({
      ...generation,
      intent: GenerationIntent.Regeneration,
      outputMessageId: "replacement",
    }));
    const state = deriveThreadViewState({
      pages: [{ ...current, messages, generations }],
      regenerationRequestMessageId: "message-assistant",
      retryActivity: null,
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.messages[1]?.regeneration).toEqual({ status: "available", canRegenerate: true });
    expect(state.pendingGenerationIntent).toBeNull();
  });

  it("keeps an accepted initial-reply retry assigned to the composer", () => {
    const state = deriveThreadViewState({
      pages: [page(GenerationStatus.Pending)],
      regenerationRequestMessageId: null,
      retryActivity: { turnId: "turn", status: "pending" },
      actionsAvailable: true,
      hasModel: true,
    });

    expect(state.pendingGenerationIntent).toBe(GenerationIntent.Reply);
    expect(state.messages.every(({ regeneration }) => regeneration === null)).toBe(true);
  });
});
