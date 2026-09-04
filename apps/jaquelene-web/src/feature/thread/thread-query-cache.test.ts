import {
  GenerationFailureKind,
  GenerationIntent,
  GenerationStatus,
  ThreadMessageAuthor,
  type CompletedReply,
  type FailedReply,
  type ThreadMessage,
  type ThreadMessagePage,
  type TurnGeneration,
  type TurnSubmission,
} from "@jaquelene/ipc/renderer";
import { describe, expect, it } from "vite-plus/test";
import {
  createLatestThreadHistory,
  isLatestThreadHistory,
  latestThreadHistoryPageParam,
  reconcileThreadMessageEdit,
  reconcileThreadTurn,
  requireValidThreadHistory,
  retainThreadHistory,
  type ThreadQueryData,
  type ThreadTurnUpdate,
} from "./thread-query-cache";

const threadId = "thread-test";
const defaultContentByteBudget = 128 * 1024;
const textEncoder = new TextEncoder();

type PageOptions = {
  contentByteBudget?: number;
  messageCountLimit?: number;
  olderCursor?: string;
  newerCursor?: string;
};

function page(
  messages: ThreadMessage[],
  generations: TurnGeneration[],
  {
    contentByteBudget = defaultContentByteBudget,
    messageCountLimit = 50,
    olderCursor,
    newerCursor,
  }: Readonly<PageOptions> = {},
): ThreadMessagePage {
  return {
    messages,
    generations,
    messageCountLimit,
    messageMaxCodeUnits: 100_000,
    contentByteBudget,
    contentBytes: messages.reduce(
      (total, { content }) => total + textEncoder.encode(content).byteLength,
      0,
    ),
    ...(olderCursor ? { olderCursor } : {}),
    ...(newerCursor ? { newerCursor } : {}),
  };
}

function olderPageParam(cursor: string) {
  return { kind: "cursor", direction: "older", cursor } as const;
}

function newerPageParam(cursor: string) {
  return { kind: "cursor", direction: "newer", cursor } as const;
}

function pendingTurn(
  sequence: number,
  intent: GenerationIntent = GenerationIntent.Reply,
): TurnSubmission {
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
    intent,
    providerId: "provider",
    modelId: "model",
    status: GenerationStatus.Pending,
    startedAt: sequence,
  };

  return {
    userMessage,
    generation,
    threadActivity: { threadId, lastActivityAt: sequence, turnCount: sequence },
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
      intent: acceptance.generation.intent,
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
  it("repartitions edited content while preserving a valid latest window", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const third = failedTurn(3);
    first.userMessage.content = "1111";
    second.userMessage.content = "2222";
    third.userMessage.content = "3333";
    const data: ThreadQueryData = {
      pages: [
        page([second.userMessage, third.userMessage], [second.generation, third.generation], {
          contentByteBudget: 8,
          olderCursor: first.userMessage.id,
        }),
        page([first.userMessage], [first.generation], {
          contentByteBudget: 8,
          newerCursor: second.userMessage.id,
        }),
      ],
      pageParams: [latestThreadHistoryPageParam, olderPageParam(first.userMessage.id)],
    };
    const editedMessage = { ...second.userMessage, content: "222222" };
    const reconciliation = reconcileThreadMessageEdit(data, editedMessage);

    if (reconciliation.outcome !== "updated") {
      throw new Error(`Expected an updated cache, received ${reconciliation.outcome}.`);
    }

    expect(
      reconciliation.data.pages.map(({ messages }) =>
        messages.map(({ sequence, content }) => [sequence, content]),
      ),
    ).toEqual([[[3, "3333"]], [[2, "222222"]], [[1, "1111"]]]);
    expect(reconciliation.data.pageParams).toEqual([
      latestThreadHistoryPageParam,
      olderPageParam(second.userMessage.id),
      olderPageParam(first.userMessage.id),
    ]);
    expect(() => requireValidThreadHistory(reconciliation.data, threadId)).not.toThrow();
  });

  it("retains an oversized edited message and its historical cursors", () => {
    const turns = Array.from({ length: 3 }, (_, index) => failedTurn(index + 1));

    for (const turn of turns) {
      turn.userMessage.content = "\u6f22".repeat(100_000);
    }

    const data: ThreadQueryData = {
      pages: turns.toReversed().map(({ userMessage, generation }, index, pages) => {
        const newerPage = pages[index - 1];
        const olderPage = pages[index + 1];
        const options: PageOptions = {};

        if (olderPage) {
          options.olderCursor = olderPage.userMessage.id;
        }

        if (newerPage) {
          options.newerCursor = newerPage.userMessage.id;
        }

        return page([userMessage], [generation], options);
      }),
      pageParams: [
        latestThreadHistoryPageParam,
        olderPageParam(turns[1]!.userMessage.id),
        olderPageParam(turns[0]!.userMessage.id),
      ],
    };
    const target = turns[1]!.userMessage;
    const editedMessage = { ...target, content: "\u754c".repeat(100_000) };
    const reconciliation = reconcileThreadMessageEdit(data, editedMessage);

    if (reconciliation.outcome !== "updated") {
      throw new Error(`Expected an updated cache, received ${reconciliation.outcome}.`);
    }

    expect(reconciliation.data.pages).toHaveLength(1);
    expect(reconciliation.data.pages[0]).toEqual(
      expect.objectContaining({
        messages: [editedMessage],
        newerCursor: turns[2]!.userMessage.id,
        olderCursor: turns[0]!.userMessage.id,
        contentBytes: 300_000,
      }),
    );
    expect(reconciliation.data.pageParams).toEqual([olderPageParam(editedMessage.id)]);
    expect(isLatestThreadHistory(reconciliation.data)).toBe(false);
    expect(() => requireValidThreadHistory(reconciliation.data, threadId)).not.toThrow();
  });

  it("ignores unloaded edits and rejects immutable message changes", () => {
    const turn = failedTurn(1);
    const data: ThreadQueryData = {
      pages: [page([turn.userMessage], [turn.generation])],
      pageParams: [latestThreadHistoryPageParam],
    };

    expect(
      reconcileThreadMessageEdit(data, {
        ...turn.userMessage,
        id: "message-outside-window",
        sequence: 2,
        content: "Edited elsewhere",
      }),
    ).toEqual({ outcome: "current" });
    expect(
      reconcileThreadMessageEdit(data, {
        ...turn.userMessage,
        author: ThreadMessageAuthor.Assistant,
        content: "Inconsistent edit",
      }),
    ).toEqual({ outcome: "reload" });
  });

  it("uses server page capacity when an accepted turn overflows the latest page", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const data: ThreadQueryData = {
      pages: [
        page([first.userMessage, second.userMessage], [first.generation, second.generation], {
          messageCountLimit: 2,
        }),
      ],
      pageParams: [latestThreadHistoryPageParam],
    };

    const updated = requireUpdated(data, {
      type: "submission-accepted",
      ...pendingTurn(3),
    });

    expect(updated.pages.map((page) => page.messages.map(({ sequence }) => sequence))).toEqual([
      [2, 3],
      [1],
    ]);
    expect(updated.pages.map(({ messageCountLimit }) => messageCountLimit)).toEqual([2, 2]);
    expect(updated.pages[0]?.generations).toContainEqual(
      expect.objectContaining({ turnId: "turn-3", status: GenerationStatus.Pending }),
    );
  });

  it("repartitions settlement updates by the server content-byte budget", () => {
    const first = failedTurn(1);
    const second = failedTurn(2);
    const third = pendingTurn(3);
    first.userMessage.content = "11111";
    second.userMessage.content = "22222";
    third.userMessage.content = "333333";
    const data: ThreadQueryData = {
      pages: [
        page([first.userMessage, second.userMessage], [first.generation, second.generation], {
          contentByteBudget: 10,
        }),
      ],
      pageParams: [latestThreadHistoryPageParam],
    };

    const updated = requireUpdated(data, { type: "submission-accepted", ...third });

    expect(updated.pages.map(({ messages }) => messages.map(({ sequence }) => sequence))).toEqual([
      [3],
      [1, 2],
    ]);
    expect(updated.pages.map(({ contentBytes }) => contentBytes)).toEqual([6, 10]);
    expect(updated.pages.every(({ contentByteBudget }) => contentByteBudget === 10)).toBe(true);
    expect(updated.pageParams).toEqual([
      latestThreadHistoryPageParam,
      olderPageParam(second.userMessage.id),
    ]);
  });

  it("keeps loaded history in server-sized pages as turns settle", () => {
    const initialTurns = Array.from({ length: 50 }, (_, index) => failedTurn(index + 1));
    const initial: ThreadQueryData = {
      pages: [
        page(
          initialTurns.map(({ userMessage }) => userMessage),
          initialTurns.map(({ generation }) => generation),
          { olderCursor: "older-message" },
        ),
      ],
      pageParams: [latestThreadHistoryPageParam],
    };
    let current = initial;

    for (let sequence = 51; sequence <= 101; sequence += 1) {
      current = requireUpdated(current, { type: "reply-failed", ...failedTurn(sequence) });
    }

    expect(current.pages.map(({ messages }) => messages.length)).toEqual([50, 50, 1]);
    expect(
      current.pages
        .toReversed()
        .flatMap(({ messages }) => messages.map(({ sequence }) => sequence)),
    ).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    expect(current.pages.at(-1)?.olderCursor).toBe("older-message");
    expect(current.pageParams).toEqual([
      latestThreadHistoryPageParam,
      olderPageParam("message-51"),
      olderPageParam("message-1"),
    ]);
    expect(initial.pages[0]?.messages).toHaveLength(50);
  });

  it("retains a contiguous window within the client content-byte budget", () => {
    const turns = Array.from({ length: 4 }, (_, index) => {
      const turn = failedTurn(index + 1);
      turn.userMessage.content = String(index + 1).repeat(100_000);
      return turn;
    });
    const data: ThreadQueryData = {
      pages: turns.toReversed().map(({ userMessage, generation }, index, pages) => {
        const newerPage = pages[index - 1];
        const olderPage = pages[index + 1];

        return page([userMessage], [generation], {
          ...(olderPage ? { olderCursor: olderPage.userMessage.id } : {}),
          ...(newerPage ? { newerCursor: newerPage.userMessage.id } : {}),
        });
      }),
      pageParams: [
        latestThreadHistoryPageParam,
        olderPageParam("message-3"),
        olderPageParam("message-2"),
        olderPageParam("message-1"),
      ],
    };

    const newest = retainThreadHistory(data, "newest");
    const oldest = retainThreadHistory(data, "oldest");

    expect(newest.pages.map(({ messages }) => messages[0]?.sequence)).toEqual([4, 3]);
    expect(newest.pageParams).toEqual([latestThreadHistoryPageParam, olderPageParam("message-3")]);
    expect(isLatestThreadHistory(newest)).toBe(true);
    expect(oldest.pages.map(({ messages }) => messages[0]?.sequence)).toEqual([2, 1]);
    expect(oldest.pageParams).toEqual([olderPageParam("message-2"), olderPageParam("message-1")]);
    expect(isLatestThreadHistory(oldest)).toBe(false);
  });

  it("retains at most three pages at the requested history edge", () => {
    const turns = Array.from({ length: 4 }, (_, index) => failedTurn(index + 1));
    const data: ThreadQueryData = {
      pages: turns.toReversed().map(({ userMessage, generation }, index, pages) => {
        const newerPage = pages[index - 1];
        const olderPage = pages[index + 1];

        return page([userMessage], [generation], {
          ...(olderPage ? { olderCursor: olderPage.userMessage.id } : {}),
          ...(newerPage ? { newerCursor: newerPage.userMessage.id } : {}),
        });
      }),
      pageParams: [
        latestThreadHistoryPageParam,
        olderPageParam("message-3"),
        olderPageParam("message-2"),
        olderPageParam("message-1"),
      ],
    };

    const newest = retainThreadHistory(data, "newest");
    const oldest = retainThreadHistory(data, "oldest");

    expect(newest.pages.map(({ messages }) => messages[0]?.sequence)).toEqual([4, 3, 2]);
    expect(newest.pageParams).toEqual([
      latestThreadHistoryPageParam,
      olderPageParam("message-3"),
      olderPageParam("message-2"),
    ]);
    expect(oldest.pages.map(({ messages }) => messages[0]?.sequence)).toEqual([3, 2, 1]);
    expect(oldest.pageParams).toEqual([
      olderPageParam("message-3"),
      olderPageParam("message-2"),
      olderPageParam("message-1"),
    ]);
  });

  it("validates a mixed-direction window without gaps or duplicate boundary messages", () => {
    const turns = Array.from({ length: 4 }, (_, index) => failedTurn(index + 1));
    const data: ThreadQueryData = {
      pages: [
        page([turns[3]!.userMessage], [turns[3]!.generation], {
          olderCursor: turns[2]!.userMessage.id,
        }),
        page([turns[2]!.userMessage], [turns[2]!.generation], {
          newerCursor: turns[3]!.userMessage.id,
          olderCursor: turns[1]!.userMessage.id,
        }),
        page([turns[1]!.userMessage], [turns[1]!.generation], {
          newerCursor: turns[2]!.userMessage.id,
          olderCursor: turns[0]!.userMessage.id,
        }),
      ],
      pageParams: [
        newerPageParam(turns[3]!.userMessage.id),
        olderPageParam(turns[2]!.userMessage.id),
        olderPageParam(turns[1]!.userMessage.id),
      ],
    };

    expect(requireValidThreadHistory(data, threadId)).toBe(data);
    expect(isLatestThreadHistory(data)).toBe(false);
    expect(() =>
      requireValidThreadHistory(
        {
          ...data,
          pages: [data.pages[0]!, { ...data.pages[1]!, newerCursor: "wrong" }, data.pages[2]!],
        },
        threadId,
      ),
    ).toThrow("Thread message history is inconsistent.");
  });

  it("retains a required page alone when that page exceeds the history budget", () => {
    const newest = failedTurn(2);
    newest.userMessage.content = "漢".repeat(100_000);
    const older = failedTurn(1);
    const data: ThreadQueryData = {
      pages: [
        page([newest.userMessage], [newest.generation], {
          olderCursor: older.userMessage.id,
        }),
        page([older.userMessage], [older.generation], {
          newerCursor: newest.userMessage.id,
        }),
      ],
      pageParams: [latestThreadHistoryPageParam, olderPageParam(older.userMessage.id)],
    };

    const retained = retainThreadHistory(data, "newest");

    expect(retained.pages).toEqual([data.pages[0]]);
    expect(retained.pages[0]?.contentBytes).toBe(300_000);
  });

  it("advances a failed latest turn through pending retry and completion", () => {
    const failed = failedTurn(1);
    const retryAcceptance: TurnSubmission = {
      userMessage: failed.userMessage,
      generation: {
        ...pendingTurn(2, GenerationIntent.Retry).generation,
        turnId: failed.userMessage.turnId,
      },
      threadActivity: failed.threadActivity,
    };
    const completed = completedTurn(retryAcceptance, 2);
    const data: ThreadQueryData = {
      pages: [page([failed.userMessage], [failed.generation])],
      pageParams: [latestThreadHistoryPageParam],
    };

    const pending = requireUpdated(data, {
      type: "retry-accepted",
      generation: retryAcceptance.generation,
    });

    expect(pending.pages[0]?.generations).toEqual([retryAcceptance.generation]);
    expect(requireUpdated(pending, { type: "reply-completed", ...completed })).toEqual({
      pages: [page([failed.userMessage, completed.assistantMessage], [completed.generation])],
      pageParams: [latestThreadHistoryPageParam],
    });
  });

  it("keeps the active response during regeneration and replaces it on completion", () => {
    const originalAcceptance = pendingTurn(1);
    const original = completedTurn(originalAcceptance, 2);
    const regenerationAcceptance: TurnSubmission = {
      userMessage: original.userMessage,
      generation: {
        ...pendingTurn(3, GenerationIntent.Regeneration).generation,
        turnId: original.userMessage.turnId,
      },
      threadActivity: original.threadActivity,
    };
    const regenerated = completedTurn(regenerationAcceptance, 4);
    const data: ThreadQueryData = {
      pages: [page([original.userMessage, original.assistantMessage], [original.generation])],
      pageParams: [latestThreadHistoryPageParam],
    };

    const pending = requireUpdated(data, {
      type: "regeneration-accepted",
      assistantMessageId: original.assistantMessage.id,
      generation: regenerationAcceptance.generation,
    });

    expect(pending.pages[0]?.messages).toEqual([original.userMessage, original.assistantMessage]);
    expect(pending.pages[0]?.generations).toEqual([regenerationAcceptance.generation]);
    expect(requireUpdated(pending, { type: "reply-completed", ...regenerated })).toEqual({
      pages: [page([original.userMessage, regenerated.assistantMessage], [regenerated.generation])],
      pageParams: [latestThreadHistoryPageParam],
    });
  });

  it("keeps the active response when regeneration fails", () => {
    const originalAcceptance = pendingTurn(1);
    const original = completedTurn(originalAcceptance, 2);
    const pendingGeneration = {
      ...pendingTurn(3, GenerationIntent.Regeneration).generation,
      turnId: original.userMessage.turnId,
    };
    const failedGeneration: TurnGeneration = {
      ...pendingGeneration,
      status: GenerationStatus.Failed,
      failureKind: GenerationFailureKind.Provider,
      finishedAt: 4,
    };
    const data: ThreadQueryData = {
      pages: [page([original.userMessage, original.assistantMessage], [original.generation])],
      pageParams: [latestThreadHistoryPageParam],
    };
    const pending = requireUpdated(data, {
      type: "regeneration-accepted",
      assistantMessageId: original.assistantMessage.id,
      generation: pendingGeneration,
    });

    expect(
      requireUpdated(pending, {
        type: "reply-failed",
        userMessage: original.userMessage,
        generation: failedGeneration,
      }),
    ).toEqual({
      pages: [page([original.userMessage, original.assistantMessage], [failedGeneration])],
      pageParams: [latestThreadHistoryPageParam],
    });
  });

  it("does not downgrade a fast settlement when pending acceptance arrives later", () => {
    const acceptance = pendingTurn(1);
    const completed = completedTurn(acceptance, 2);
    const empty: ThreadQueryData = {
      pages: [page([], [])],
      pageParams: [latestThreadHistoryPageParam],
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
        page([second.userMessage], [second.generation], {
          messageCountLimit: 1,
          olderCursor: first.userMessage.id,
        }),
        page([first.userMessage], [first.generation], {
          messageCountLimit: 1,
          newerCursor: second.userMessage.id,
        }),
      ],
      pageParams: [latestThreadHistoryPageParam, olderPageParam(first.userMessage.id)],
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
      pages: [page([first.userMessage, second.userMessage], [first.generation, second.generation])],
      pageParams: [latestThreadHistoryPageParam],
    };
    const generation = {
      ...pendingTurn(3, GenerationIntent.Retry).generation,
      turnId: first.userMessage.turnId,
    };

    expect(reconcileThreadTurn(data, threadId, { type: "retry-accepted", generation })).toEqual({
      outcome: "reload",
    });
  });

  it("requests authoritative reconciliation for a cache that violates the page contract", () => {
    const first = failedTurn(1);
    const invalidPage = page([first.userMessage], [first.generation]);
    const data: ThreadQueryData = {
      pages: [{ ...invalidPage, contentBytes: invalidPage.contentBytes + 1 }],
      pageParams: [latestThreadHistoryPageParam],
    };

    expect(
      reconcileThreadTurn(data, threadId, {
        type: "submission-accepted",
        ...pendingTurn(2),
      }),
    ).toEqual({ outcome: "reload" });
  });

  it("leaves a bounded historical window unchanged when live updates arrive", () => {
    const historical = failedTurn(1);
    const data: ThreadQueryData = {
      pages: [page([historical.userMessage], [historical.generation])],
      pageParams: [olderPageParam(historical.userMessage.id)],
    };

    expect(
      reconcileThreadTurn(data, threadId, {
        type: "submission-accepted",
        ...pendingTurn(2),
      }),
    ).toEqual({ outcome: "historical" });
    expect(
      reconcileThreadTurn(data, "a-different-thread", {
        type: "submission-accepted",
        ...pendingTurn(2),
      }),
    ).toEqual({ outcome: "historical" });
  });

  it("creates only a consistent latest window from an authoritative page", () => {
    const latest = failedTurn(1);
    const latestPage = page([latest.userMessage], [latest.generation]);

    expect(createLatestThreadHistory(latestPage, threadId)).toEqual({
      pages: [latestPage],
      pageParams: [latestThreadHistoryPageParam],
    });

    const inconsistentPages = [
      { ...latestPage, contentBytes: latestPage.contentBytes + 1 },
      { ...latestPage, generations: [...latestPage.generations, latest.generation] },
      {
        ...latestPage,
        generations: [{ ...latest.generation, turnId: "turn-other" }],
      },
    ];

    for (const inconsistentPage of inconsistentPages) {
      expect(() => createLatestThreadHistory(inconsistentPage, threadId)).toThrow(
        "Thread message history is inconsistent.",
      );
    }
  });

  it("requests authoritative reconciliation for inconsistent turn updates", () => {
    const acceptance = pendingTurn(1);
    const completion = completedTurn(acceptance, 2);
    const failure = failedTurn(1);
    const data: ThreadQueryData = {
      pages: [page([], [])],
      pageParams: [latestThreadHistoryPageParam],
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
      {
        type: "submission-accepted",
        ...acceptance,
        generation: { ...acceptance.generation, intent: GenerationIntent.Retry },
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
      { type: "retry-accepted", generation: acceptance.generation },
      { type: "retry-accepted", generation: failure.generation },
      {
        type: "regeneration-accepted",
        assistantMessageId: "message-assistant",
        generation: acceptance.generation,
      },
    ];

    for (const update of inconsistentUpdates) {
      expect(reconcileThreadTurn(data, threadId, update)).toEqual({ outcome: "reload" });
    }
  });
});
