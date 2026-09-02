import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ipc = vi.hoisted(() => {
  type HistoryDeletion = Readonly<{ threadId: string }>;
  type HistoryDeletedListener = (deletion: HistoryDeletion) => void;

  let historyDeletedListener: HistoryDeletedListener | undefined;
  const stopHistoryDeleted = vi.fn();
  const stopReplyFailed = vi.fn();
  const stopReplyCompleted = vi.fn();
  const stopReplySuperseded = vi.fn();

  return {
    Threads: { listMessages: vi.fn() },
    Turns: {
      deleteFrom: vi.fn(),
      submit: vi.fn(),
      retry: vi.fn(),
      onHistoryDeleted: vi.fn((listener: HistoryDeletedListener) => {
        historyDeletedListener = listener;
        return stopHistoryDeleted;
      }),
      onReplyFailed: vi.fn(() => stopReplyFailed),
      onReplyCompleted: vi.fn(() => stopReplyCompleted),
      onReplySuperseded: vi.fn(() => stopReplySuperseded),
    },
    listener: () => historyDeletedListener,
    reset() {
      historyDeletedListener = undefined;
      stopHistoryDeleted.mockClear();
      stopReplyFailed.mockClear();
      stopReplyCompleted.mockClear();
      stopReplySuperseded.mockClear();
    },
    stops: {
      historyDeleted: stopHistoryDeleted,
      replyFailed: stopReplyFailed,
      replyCompleted: stopReplyCompleted,
      replySuperseded: stopReplySuperseded,
    },
  };
});

vi.mock("@jaquelene/ipc/renderer", () => ({
  ThreadMessagePageDirection: { Older: "older", Newer: "newer" },
  Threads: ipc.Threads,
  Turns: ipc.Turns,
}));

vi.mock("@/feature/campaign/usage-query", () => ({
  invalidateCampaignUsage: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/feature/diagnostics/diagnostics", () => ({ reportError: vi.fn() }));

import { installThreadReconciliation, threadMessagesQuery } from "./query";

beforeEach(() => {
  ipc.reset();
});

describe("thread reconciliation", () => {
  it("resets every cached history page after committed deletion", () => {
    const queryClient = new QueryClient();
    const resetQueries = vi.spyOn(queryClient, "resetQueries").mockResolvedValue();
    const threadId = "thread_01k46w4v06f7vs6qdqb8r78x8w";
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.({ threadId });

    expect(resetQueries).toHaveBeenCalledWith({
      queryKey: threadMessagesQuery(threadId).queryKey,
      exact: true,
    });

    stop();
    expect(ipc.stops.historyDeleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replyFailed).toHaveBeenCalledOnce();
    expect(ipc.stops.replyCompleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replySuperseded).toHaveBeenCalledOnce();
  });
});
