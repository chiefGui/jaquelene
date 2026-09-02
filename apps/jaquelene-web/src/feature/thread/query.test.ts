import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ipc = vi.hoisted(() => {
  type HistoryDeletion = Readonly<{
    threadId: string;
    threadActivity: Readonly<{
      threadId: string;
      lastActivityAt: number;
      turnCount: number;
    }>;
  }>;
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

const campaignCache = vi.hoisted(() => ({
  invalidateCampaignPages: vi.fn(() => Promise.resolve()),
  updateCampaignActivity: vi.fn(() => true),
}));

vi.mock("@jaquelene/ipc/renderer", () => ({
  ThreadMessagePageDirection: { Older: "older", Newer: "newer" },
  Threads: ipc.Threads,
  Turns: ipc.Turns,
}));

vi.mock("@/feature/campaign/usage-query", () => ({
  invalidateCampaignUsage: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/feature/campaign/query", () => campaignCache);

vi.mock("@/feature/diagnostics/diagnostics", () => ({ reportError: vi.fn() }));

import { installThreadReconciliation, threadMessagesQuery } from "./query";

beforeEach(() => {
  ipc.reset();
  campaignCache.invalidateCampaignPages.mockClear();
  campaignCache.updateCampaignActivity.mockClear();
  campaignCache.updateCampaignActivity.mockReturnValue(true);
});

describe("thread reconciliation", () => {
  it("resets every cached history page after committed deletion", () => {
    const queryClient = new QueryClient();
    const resetQueries = vi.spyOn(queryClient, "resetQueries").mockResolvedValue();
    const threadId = "thread_01k46w4v06f7vs6qdqb8r78x8w";
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.({
      threadId,
      threadActivity: { threadId, lastActivityAt: 500, turnCount: 2 },
    });

    expect(resetQueries).toHaveBeenCalledWith({
      queryKey: threadMessagesQuery(threadId).queryKey,
      exact: true,
    });
    expect(campaignCache.updateCampaignActivity).toHaveBeenCalledWith(
      queryClient,
      { threadId, lastActivityAt: 500, turnCount: 2 },
      { allowRewind: true },
    );
    expect(campaignCache.invalidateCampaignPages).toHaveBeenCalledWith(queryClient);

    stop();
    expect(ipc.stops.historyDeleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replyFailed).toHaveBeenCalledOnce();
    expect(ipc.stops.replyCompleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replySuperseded).toHaveBeenCalledOnce();
  });
});
