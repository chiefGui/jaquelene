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
  type Message = Readonly<{
    id: string;
    threadId: string;
    turnId: string;
    sequence: number;
    author: "user" | "assistant";
    content: string;
    createdAt: number;
  }>;
  type MessageEditedListener = (message: Message) => void;

  let historyDeletedListener: HistoryDeletedListener | undefined;
  let messageEditedListener: MessageEditedListener | undefined;
  const stopHistoryDeleted = vi.fn();
  const stopMessageEdited = vi.fn();
  const stopReplyFailed = vi.fn();
  const stopReplyCompleted = vi.fn();
  const stopReplySuperseded = vi.fn();

  return {
    Threads: { getTranscript: vi.fn(), listMessages: vi.fn() },
    Turns: {
      deleteFrom: vi.fn(),
      editMessage: vi.fn(),
      regenerate: vi.fn(),
      submit: vi.fn(),
      retry: vi.fn(),
      onHistoryDeleted: vi.fn((listener: HistoryDeletedListener) => {
        historyDeletedListener = listener;
        return stopHistoryDeleted;
      }),
      onMessageEdited: vi.fn((listener: MessageEditedListener) => {
        messageEditedListener = listener;
        return stopMessageEdited;
      }),
      onReplyFailed: vi.fn(() => stopReplyFailed),
      onReplyCompleted: vi.fn(() => stopReplyCompleted),
      onReplySuperseded: vi.fn(() => stopReplySuperseded),
    },
    listener: () => historyDeletedListener,
    messageListener: () => messageEditedListener,
    reset() {
      historyDeletedListener = undefined;
      messageEditedListener = undefined;
      stopHistoryDeleted.mockClear();
      stopMessageEdited.mockClear();
      stopReplyFailed.mockClear();
      stopReplyCompleted.mockClear();
      stopReplySuperseded.mockClear();
    },
    stops: {
      historyDeleted: stopHistoryDeleted,
      messageEdited: stopMessageEdited,
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
  ThreadMessageAuthor: { User: "user", Assistant: "assistant" },
  ThreadMessagePageDirection: { Older: "older", Newer: "newer" },
  Threads: ipc.Threads,
  Turns: ipc.Turns,
}));

vi.mock("@/feature/campaign/usage-query", () => ({
  invalidateCampaignUsage: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/feature/campaign/query", () => campaignCache);

vi.mock("@/feature/diagnostics/diagnostics", () => ({ reportError: vi.fn() }));

import { ThreadMessageAuthor } from "@jaquelene/ipc/renderer";
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
    expect(ipc.stops.messageEdited).toHaveBeenCalledOnce();
    expect(ipc.stops.replyFailed).toHaveBeenCalledOnce();
    expect(ipc.stops.replyCompleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replySuperseded).toHaveBeenCalledOnce();
  });

  it("applies committed message edits to cached thread history", () => {
    const queryClient = new QueryClient();
    const threadId = "thread_01k46w4v06f7vs6qdqb8r78x8w";
    const message = {
      id: "message_01k46w4v06f7vs6qdqb8r78x8w",
      threadId,
      turnId: "turn_01k46w4v06f7vs6qdqb8r78x8w",
      sequence: 1,
      author: ThreadMessageAuthor.User,
      content: "Original",
      createdAt: 100,
    };
    const queryKey = threadMessagesQuery(threadId).queryKey;
    queryClient.setQueryData(queryKey, {
      pages: [
        {
          messages: [message],
          generations: [],
          messageCountLimit: 50,
          messageMaxCodeUnits: 100_000,
          contentByteBudget: 128 * 1024,
          contentBytes: 8,
        },
      ],
      pageParams: [{ kind: "latest" }],
    });
    const stop = installThreadReconciliation(queryClient);
    const editedMessage = { ...message, content: "Edited" };

    ipc.messageListener()?.(editedMessage);

    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [
        {
          messages: [editedMessage],
          generations: [],
          messageCountLimit: 50,
          messageMaxCodeUnits: 100_000,
          contentByteBudget: 128 * 1024,
          contentBytes: 6,
        },
      ],
      pageParams: [{ kind: "latest" }],
    });

    stop();
  });
});
