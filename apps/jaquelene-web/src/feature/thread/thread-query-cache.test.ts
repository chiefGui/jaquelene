import {
  GenerationFailureKind,
  GenerationStatus,
  ThreadMessageAuthor,
  type CompletedReply,
  type FailedReply,
  type ThreadMessage,
  type TurnGeneration,
  type TurnSubmission,
} from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import {
  reconcileThreadTurn,
  type ThreadQueryData,
  type ThreadTurnUpdate,
} from "./thread-query-cache";

const threadId = "thread-test";

function pendingTurn(sequence: number): TurnSubmission {
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
    userMessage,
    generation,
  };
}

function failedTurn(sequence: number): FailedReply {
  const pending = pendingTurn(sequence);

  return {
    ...pending,
    generation: {
      ...pending.generation,
      status: GenerationStatus.Failed,
      failureKind: GenerationFailureKind.Provider,
      finishedAt: sequence,
    },
  };
}

function completedTurn(acceptance: TurnSubmission, sequence: number): CompletedReply {
  const assistantMessage: ThreadMessage = {
    id: `message-${sequence}`,
    threadId,
    turnId: acceptance.userMessage.turnId,
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
  };
}

function requireUpdated(data: ThreadQueryData, update: ThreadTurnUpdate) {
  const reconciliation = reconcileThreadTurn(data, threadId, update);

  if (reconciliation.outcome !== "updated") {
    throw new Error(`Expected an updated cache, received ${reconciliation.outcome}.`);
  }

  return reconciliation.data;
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

    const updated = requireUpdated(data, {
      type: "submission-accepted",
      ...pendingTurn(3),
    });

    expect(updated.pages.map((page) => page.messages.map(({ sequence }) => sequence))).toEqual([
      [2, 3],
      [1],
    ]);
    expect(updated.pages.map(({ pageSize }) => pageSize)).toEqual([2, 2]);
    expect(updated.pages[0]?.generations).toContainEqual(
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
      current = requireUpdated(current, { type: "reply-failed", ...failedTurn(sequence) });
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
    const retryAcceptance: TurnSubmission = {
      userMessage: failed.userMessage,
      generation: {
        ...pendingTurn(2).generation,
        turnId: failed.userMessage.turnId,
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

    const pending = requireUpdated(data, {
      type: "retry-accepted",
      generation: retryAcceptance.generation,
    });

    expect(pending.pages[0]?.generations).toEqual([retryAcceptance.generation]);
    expect(requireUpdated(pending, { type: "reply-completed", ...completed })).toEqual({
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
    const settled = requireUpdated(empty, { type: "reply-completed", ...completed });

    expect(
      reconcileThreadTurn(settled, threadId, { type: "submission-accepted", ...acceptance }),
    ).toEqual({ outcome: "current" });
    expect(settled.pages[0]?.generations).toEqual([completed.generation]);
  });

  it("requests authoritative reconciliation when an older branch settles", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const data: ThreadQueryData = {
      pages: [
        {
          messages: [second.userMessage],
          generations: [second.generation],
          pageSize: 1,
          messageContentMaxLength: 100_000,
          nextCursor: first.userMessage.id,
        },
        {
          messages: [first.userMessage],
          generations: [first.generation],
          pageSize: 1,
          messageContentMaxLength: 100_000,
        },
      ],
      pageParams: ["", first.userMessage.id],
    };

    expect(
      reconcileThreadTurn(data, threadId, {
        type: "reply-completed",
        ...completedTurn(first, 3),
      }),
    ).toEqual({ outcome: "reload" });
  });

  it("requests authoritative reconciliation when a retry target is not latest", () => {
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
    const generation = { ...pendingTurn(3).generation, turnId: first.userMessage.turnId };

    expect(reconcileThreadTurn(data, threadId, { type: "retry-accepted", generation })).toEqual({
      outcome: "reload",
    });
  });

  it("requests authoritative reconciliation for inconsistent turn updates", () => {
    const acceptance = pendingTurn(1);
    const completion = completedTurn(acceptance, 2);
    const failure = failedTurn(1);
    const data: ThreadQueryData = {
      pages: [{ messages: [], generations: [], pageSize: 50, messageContentMaxLength: 100_000 }],
      pageParams: [""],
    };
    const inconsistentUpdates: ThreadTurnUpdate[] = [
      {
        type: "submission-accepted",
        ...acceptance,
        userMessage: { ...acceptance.userMessage, threadId: "thread-other" },
      },
      {
        type: "submission-accepted",
        ...acceptance,
        generation: { ...acceptance.generation, turnId: "turn-other" },
      },
      { type: "reply-failed", ...acceptance },
      {
        type: "reply-completed",
        ...completion,
        assistantMessage: {
          ...completion.assistantMessage,
          author: ThreadMessageAuthor.User,
        },
      },
      { type: "retry-accepted", generation: failure.generation },
    ];

    for (const update of inconsistentUpdates) {
      expect(reconcileThreadTurn(data, threadId, update)).toEqual({ outcome: "reload" });
    }
  });
});
