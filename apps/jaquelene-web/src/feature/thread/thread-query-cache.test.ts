import {
  GenerationFailureKind,
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type TurnGeneration,
  type TurnSubmission,
} from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import { mergeThreadSubmission, type ThreadQueryData } from "./thread-query-cache";

const threadId = "thread-test";

function failedTurn(sequence: number): TurnSubmission {
  const turnId = `turn-${sequence}`;
  const userMessage: ThreadMessage = {
    id: `message-${sequence}`,
    threadId,
    turnId,
    sequence,
    author: ThreadMessageAuthor.User,
    content: `Message ${sequence}`,
    createdAt: sequence,
  };
  const generation: TurnGeneration = {
    id: `generation-${sequence}`,
    turnId,
    providerId: "provider",
    modelId: "model",
    status: GenerationStatus.Failed,
    failureKind: GenerationFailureKind.Provider,
    startedAt: sequence,
    finishedAt: sequence,
  };

  return {
    turn: { id: turnId, threadId, createdAt: sequence },
    userMessage,
    generation,
    assistantActivated: false,
  };
}

function completedRetry(submission: TurnSubmission, sequence: number): TurnSubmission {
  const assistantMessage: ThreadMessage = {
    id: `message-${sequence}`,
    threadId,
    turnId: submission.turn.id,
    sequence,
    author: ThreadMessageAuthor.Assistant,
    content: "Recovered reply",
    createdAt: sequence,
  };

  return {
    ...submission,
    generation: {
      id: `generation-${sequence}`,
      turnId: submission.generation.turnId,
      providerId: submission.generation.providerId,
      modelId: submission.generation.modelId,
      status: GenerationStatus.Completed,
      outputMessageId: assistantMessage.id,
      startedAt: sequence,
      finishedAt: sequence,
    },
    assistantMessage,
    assistantActivated: true,
  };
}

describe("thread query cache", () => {
  it("uses the server page capacity when a submission overflows the latest page", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const data: ThreadQueryData = {
      pages: [
        {
          messages: [first.userMessage, second.userMessage],
          generations: [first.generation, second.generation],
          pageSize: 2,
          messageContentMaxLength: 100_000,
        },
      ],
      pageParams: [""],
    };

    const updated = mergeThreadSubmission(data, threadId, "submit", failedTurn(3));

    expect(updated?.pages.map((page) => page.messages.map(({ sequence }) => sequence))).toEqual([
      [2, 3],
      [1],
    ]);
    expect(updated?.pages.map(({ pageSize }) => pageSize)).toEqual([2, 2]);
  });

  it("keeps loaded history in server-sized pages as new turns arrive", () => {
    const initialTurns = Array.from({ length: 50 }, (_, index) => failedTurn(index + 1));
    const initial: ThreadQueryData = {
      pages: [
        {
          messages: initialTurns.map(({ userMessage }) => userMessage),
          generations: initialTurns.map(({ generation }) => generation),
          pageSize: 50,
          messageContentMaxLength: 100_000,
          nextCursor: "older-message",
        },
      ],
      pageParams: [""],
    };
    let current = initial;

    for (let sequence = 51; sequence <= 101; sequence += 1) {
      const updated = mergeThreadSubmission(current, threadId, "submit", failedTurn(sequence));

      if (!updated) {
        throw new Error(`Turn ${sequence} could not be merged into the thread query cache.`);
      }

      current = updated;
    }

    expect(current.pages.map(({ messages }) => messages.length)).toEqual([50, 1, 50]);
    expect(
      current.pages
        .toReversed()
        .flatMap(({ messages }) => messages.map(({ sequence }) => sequence)),
    ).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    expect(current.pages.at(-1)?.nextCursor).toBe("older-message");
    expect(current.pageParams).toEqual(["", "message-51", "message-50"]);
    expect(initial.pages[0]?.messages).toHaveLength(50);
  });

  it("replaces a failed latest attempt with its successful retry", () => {
    const failed = failedTurn(1);
    const completed = completedRetry(failed, 2);
    const data: ThreadQueryData = {
      pages: [
        {
          messages: [failed.userMessage],
          generations: [failed.generation],
          pageSize: 50,
          messageContentMaxLength: 100_000,
        },
      ],
      pageParams: [""],
    };

    expect(mergeThreadSubmission(data, threadId, "retry", completed)).toEqual({
      pages: [
        {
          messages: [failed.userMessage, completed.assistantMessage],
          generations: [completed.generation],
          pageSize: 50,
          messageContentMaxLength: 100_000,
        },
      ],
      pageParams: [""],
    });
  });

  it("refetches instead of merging a retry that switches an older branch", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const data: ThreadQueryData = {
      pages: [
        {
          messages: [first.userMessage, second.userMessage],
          generations: [first.generation, second.generation],
          pageSize: 50,
          messageContentMaxLength: 100_000,
        },
      ],
      pageParams: [""],
    };

    expect(mergeThreadSubmission(data, threadId, "retry", completedRetry(first, 3))).toBeNull();
  });
});
