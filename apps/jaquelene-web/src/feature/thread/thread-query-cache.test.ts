import {
  GenerationFailureKind,
  GenerationStatus,
  ThreadMessageAuthor,
  type ThreadMessage,
  type TurnAcceptance,
  type TurnGeneration,
  type TurnSettlement,
} from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import { mergeThreadTurnState, type ThreadQueryData } from "./thread-query-cache";

const threadId = "thread-test";

function pendingTurn(sequence: number): TurnAcceptance {
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
    status: GenerationStatus.Pending,
    startedAt: sequence,
  };

  return {
    turn: { id: turnId, threadId, createdAt: sequence },
    userMessage,
    generation,
  };
}

function failedTurn(sequence: number): TurnSettlement {
  const pending = pendingTurn(sequence);

  return {
    ...pending,
    generation: {
      ...pending.generation,
      status: GenerationStatus.Failed,
      failureKind: GenerationFailureKind.Provider,
      finishedAt: sequence,
    },
    assistantActivated: false,
  };
}

function completedTurn(acceptance: TurnAcceptance, sequence: number): TurnSettlement {
  const assistantMessage: ThreadMessage = {
    id: `message-${sequence}`,
    threadId,
    turnId: acceptance.turn.id,
    sequence,
    author: ThreadMessageAuthor.Assistant,
    content: "Recovered reply",
    createdAt: sequence,
  };

  return {
    ...acceptance,
    generation: {
      id: acceptance.generation.id,
      turnId: acceptance.generation.turnId,
      providerId: acceptance.generation.providerId,
      modelId: acceptance.generation.modelId,
      status: GenerationStatus.Completed,
      outputMessageId: assistantMessage.id,
      startedAt: acceptance.generation.startedAt,
      finishedAt: sequence,
    },
    assistantMessage,
    assistantActivated: true,
  };
}

describe("thread query cache", () => {
  it("uses server page capacity when an accepted turn overflows the latest page", () => {
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

    const updated = mergeThreadTurnState(data, threadId, "submit", pendingTurn(3));

    expect(updated?.pages.map((page) => page.messages.map(({ sequence }) => sequence))).toEqual([
      [2, 3],
      [1],
    ]);
    expect(updated?.pages.map(({ pageSize }) => pageSize)).toEqual([2, 2]);
    expect(updated?.pages[0]?.generations).toContainEqual(
      expect.objectContaining({ turnId: "turn-3", status: GenerationStatus.Pending }),
    );
  });

  it("keeps loaded history in server-sized pages as turns settle", () => {
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
      const updated = mergeThreadTurnState(current, threadId, "settle", failedTurn(sequence));

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

  it("advances a failed latest turn through pending retry and completion", () => {
    const failed = failedTurn(1);
    const retryAcceptance: TurnAcceptance = {
      turn: failed.turn,
      userMessage: failed.userMessage,
      generation: {
        ...pendingTurn(2).generation,
        turnId: failed.turn.id,
      },
    };
    const completed = completedTurn(retryAcceptance, 2);
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

    const pending = mergeThreadTurnState(data, threadId, "retry", retryAcceptance);

    expect(pending?.pages[0]?.generations).toEqual([retryAcceptance.generation]);
    expect(pending && mergeThreadTurnState(pending, threadId, "settle", completed)).toEqual({
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

  it("does not downgrade a fast settlement when pending acceptance arrives later", () => {
    const acceptance = pendingTurn(1);
    const completed = completedTurn(acceptance, 2);
    const empty: ThreadQueryData = {
      pages: [{ messages: [], generations: [], pageSize: 50, messageContentMaxLength: 100_000 }],
      pageParams: [""],
    };
    const settled = mergeThreadTurnState(empty, threadId, "settle", completed);

    if (!settled) {
      throw new Error("The completed turn could not be merged.");
    }

    expect(mergeThreadTurnState(settled, threadId, "submit", acceptance)).toBe(settled);
    expect(settled.pages[0]?.generations).toEqual([completed.generation]);
  });

  it("requests authoritative reconciliation when an older branch settles", () => {
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

    expect(mergeThreadTurnState(data, threadId, "settle", completedTurn(first, 3))).toBeNull();
  });
});
