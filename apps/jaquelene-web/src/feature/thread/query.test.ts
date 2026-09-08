import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type {
  ThreadHistoryDeletion,
  ThreadMessage,
  ThreadMessagePage,
} from "@jaquelene/ipc/renderer";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ipc = vi.hoisted(() => {
  type HistoryDeletedListener = (deletion: ThreadHistoryDeletion) => void;
  type MessageEditedListener = (message: ThreadMessage) => void;

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
import { createLatestThreadHistory, type ThreadQueryData } from "./thread-query-cache";
import { reportError } from "@/feature/diagnostics/diagnostics";

const threadId = "thread_01k46w4v06f7vs6qdqb8r78x8w";

function message(sequence: number): ThreadMessage {
  return {
    id: `message-${sequence}`,
    threadId,
    turnId: `turn-${sequence}`,
    sequence,
    author: ThreadMessageAuthor.User,
    content: `Message ${sequence}`,
    createdAt: sequence,
  };
}

function page(
  messages: ThreadMessage[],
  olderCursor?: string,
  newerCursor?: string,
): ThreadMessagePage {
  return {
    messages,
    generations: [],
    messageCountLimit: 50,
    messageMaxCodeUnits: 100_000,
    contentByteBudget: 128 * 1024,
    contentBytes: messages.reduce(
      (total, item) => total + new TextEncoder().encode(item.content).length,
      0,
    ),
    ...(olderCursor && { olderCursor }),
    ...(newerCursor && { newerCursor }),
  };
}

function deletion(userSequence: number, activeMessageId?: string): ThreadHistoryDeletion {
  return {
    threadId,
    userMessageId: `message-${userSequence}`,
    ...(activeMessageId && { activeMessageId }),
    deletedTurnCount: 1,
    threadActivity: { threadId, lastActivityAt: userSequence - 1, turnCount: userSequence - 1 },
  };
}

beforeEach(() => {
  ipc.reset();
  ipc.Threads.listMessages.mockReset();
  vi.mocked(reportError).mockClear();
  campaignCache.invalidateCampaignPages.mockClear();
  campaignCache.updateCampaignActivity.mockClear();
  campaignCache.updateCampaignActivity.mockReturnValue(true);
});

describe("thread reconciliation", () => {
  it("removes committed history without dropping the surviving messages into loading", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const retained = message(1);
    const query = threadMessagesQuery(threadId);
    queryClient.setQueryData(
      query.queryKey,
      createLatestThreadHistory(page([retained, message(2)]), threadId),
    );
    ipc.Threads.listMessages.mockResolvedValue(page([retained]));
    const states: Array<ThreadQueryData | undefined> = [];
    const observer = new InfiniteQueryObserver(queryClient, query);
    const unsubscribe = observer.subscribe((result) => states.push(result.data));
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.(deletion(2, retained.id));

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<ThreadQueryData>(query.queryKey)).toEqual(
        createLatestThreadHistory(page([retained]), threadId),
      );
    });
    expect(states).not.toContain(undefined);
    expect(queryClient.getQueryData<ThreadQueryData>(query.queryKey)?.pages[0]?.messages[0]).toBe(
      retained,
    );
    expect(ipc.Threads.listMessages).toHaveBeenCalledOnce();
    expect(campaignCache.updateCampaignActivity).toHaveBeenCalledWith(
      queryClient,
      deletion(2, retained.id).threadActivity,
      { allowRewind: true },
    );
    expect(campaignCache.invalidateCampaignPages).toHaveBeenCalledWith(queryClient);

    stop();
    expect(ipc.stops.historyDeleted).toHaveBeenCalledOnce();
    expect(ipc.stops.messageEdited).toHaveBeenCalledOnce();
    expect(ipc.stops.replyFailed).toHaveBeenCalledOnce();
    expect(ipc.stops.replyCompleted).toHaveBeenCalledOnce();
    expect(ipc.stops.replySuperseded).toHaveBeenCalledOnce();
    unsubscribe();
    queryClient.clear();
  });

  it("keeps historical content while refreshing and supports pagination afterward", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    const current: ThreadQueryData = {
      pages: [page([message(7), message(8)], "message-6", "message-9")],
      pageParams: [{ kind: "cursor", direction: "older", cursor: "message-8" }],
    };
    queryClient.setQueryData(query.queryKey, current);
    const response = Promise.withResolvers<ThreadMessagePage>();
    ipc.Threads.listMessages.mockReturnValueOnce(response.promise);
    const states: Array<ThreadQueryData | undefined> = [];
    const observer = new InfiniteQueryObserver(queryClient, query);
    const unsubscribe = observer.subscribe((result) => states.push(result.data));
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.(deletion(7, "message-6"));

    await vi.waitFor(() => expect(ipc.Threads.listMessages).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(query.queryKey)).toBe(current);
    expect(ipc.Threads.listMessages).toHaveBeenCalledWith({ threadId, direction: "older" });

    const latestPage = page([message(5), message(6)], "message-4");
    response.resolve(latestPage);
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(latestPage, threadId),
      );
    });
    expect(states).not.toContain(undefined);

    const olderPage = page([message(3), message(4)], "message-2", "message-5");
    ipc.Threads.listMessages.mockResolvedValueOnce(olderPage);
    const older = await observer.fetchNextPage();
    expect(older.isSuccess).toBe(true);
    expect(older.data?.pages).toEqual([latestPage, olderPage]);
    expect(ipc.Threads.listMessages).toHaveBeenLastCalledWith({
      threadId,
      direction: "older",
      cursor: "message-4",
    });

    stop();
    unsubscribe();
    queryClient.clear();
  });

  it("cancels an older read so it cannot restore deleted messages", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    const current = createLatestThreadHistory(page([message(1), message(2)]), threadId);
    queryClient.setQueryData(query.queryKey, current);
    const response = Promise.withResolvers<ThreadMessagePage>();
    ipc.Threads.listMessages.mockReturnValueOnce(response.promise);
    const observer = new InfiniteQueryObserver(queryClient, query);
    const unsubscribe = observer.subscribe(() => {});
    const oldFetch = observer.refetch();
    const stop = installThreadReconciliation(queryClient);
    const latestPage = page([message(1)]);
    ipc.Threads.listMessages.mockResolvedValueOnce(latestPage);

    ipc.listener()?.(deletion(2, "message-1"));

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(latestPage, threadId),
      );
    });
    response.resolve(current.pages[0]!);
    await oldFetch;
    await response.promise;
    expect(queryClient.getQueryData(query.queryKey)).toEqual(
      createLatestThreadHistory(latestPage, threadId),
    );

    stop();
    unsubscribe();
    queryClient.clear();
  });

  it("replaces a fully deleted conversation with a loaded empty page", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    queryClient.setQueryData(
      query.queryKey,
      createLatestThreadHistory(page([message(1)]), threadId),
    );
    ipc.Threads.listMessages.mockResolvedValueOnce(page([]));
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.(deletion(1));

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(page([]), threadId),
      );
    });
    expect(queryClient.getQueryState(query.queryKey)?.status).toBe("success");
    stop();
    queryClient.clear();
  });

  it("keeps the newest deletion when an earlier refresh finishes late", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    queryClient.setQueryData(
      query.queryKey,
      createLatestThreadHistory(page([message(1), message(2), message(3)]), threadId),
    );
    const earlier = Promise.withResolvers<ThreadMessagePage>();
    ipc.Threads.listMessages.mockReturnValueOnce(earlier.promise);
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.(deletion(3, "message-2"));
    await vi.waitFor(() => expect(ipc.Threads.listMessages).toHaveBeenCalledOnce());
    const latestPage = page([message(1)]);
    ipc.Threads.listMessages.mockResolvedValueOnce(latestPage);
    ipc.listener()?.(deletion(2, "message-1"));
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(latestPage, threadId),
      );
    });

    earlier.resolve(page([message(1), message(2)]));
    await earlier.promise;
    expect(queryClient.getQueryData(query.queryKey)).toEqual(
      createLatestThreadHistory(latestPage, threadId),
    );
    expect(reportError).not.toHaveBeenCalled();
    stop();
    queryClient.clear();
  });

  it("retains content and reports a failed refresh, then allows another refresh", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    const current = createLatestThreadHistory(page([message(1), message(2)]), threadId);
    queryClient.setQueryData(query.queryKey, current);
    const failure = new Error("Could not read the remaining history");
    ipc.Threads.listMessages.mockRejectedValueOnce(failure);
    const stop = installThreadReconciliation(queryClient);

    ipc.listener()?.(deletion(2, "message-1"));

    await vi.waitFor(() =>
      expect(reportError).toHaveBeenCalledWith("thread.history.delete.reconcile", failure),
    );
    expect(queryClient.getQueryData(query.queryKey)).toBe(current);
    expect(queryClient.getQueryState(query.queryKey)?.error).toBe(failure);

    const latestPage = page([message(1)]);
    ipc.Threads.listMessages.mockResolvedValueOnce(latestPage);
    ipc.listener()?.(deletion(2, "message-1"));
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(latestPage, threadId),
      );
    });
    expect(queryClient.getQueryState(query.queryKey)?.error).toBeNull();

    stop();
    queryClient.clear();
  });

  it("keeps the newest deletion when notifications arrive during the initial history load", async () => {
    const queryClient = new QueryClient();
    const query = threadMessagesQuery(threadId);
    const initial = Promise.withResolvers<ThreadMessagePage>();
    const earlier = Promise.withResolvers<ThreadMessagePage>();
    const latestPage = page([message(1)]);
    ipc.Threads.listMessages
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(earlier.promise)
      .mockResolvedValueOnce(latestPage);
    const observer = new InfiniteQueryObserver(queryClient, query);
    const unsubscribe = observer.subscribe(() => {});
    const stop = installThreadReconciliation(queryClient);

    try {
      ipc.listener()?.(deletion(3, "message-2"));
      ipc.listener()?.(deletion(2, "message-1"));

      await vi.waitFor(() => {
        expect(queryClient.getQueryData(query.queryKey)).toEqual(
          createLatestThreadHistory(latestPage, threadId),
        );
      });
      initial.resolve(page([message(1), message(2), message(3)]));
      earlier.resolve(page([message(1), message(2)]));
      await Promise.all([initial.promise, earlier.promise]);
      expect(queryClient.getQueryData(query.queryKey)).toEqual(
        createLatestThreadHistory(latestPage, threadId),
      );
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      stop();
      unsubscribe();
      queryClient.clear();
    }
  });

  it("does not fetch history for a thread that has never been loaded", async () => {
    const queryClient = new QueryClient();
    const stop = installThreadReconciliation(queryClient);
    ipc.listener()?.(deletion(2, "message-1"));
    await Promise.resolve();
    expect(ipc.Threads.listMessages).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(threadMessagesQuery(threadId).queryKey)).toBeUndefined();
    stop();
    queryClient.clear();
  });

  it("applies committed message edits to cached thread history", () => {
    const queryClient = new QueryClient();
    const originalMessage = { ...message(1), content: "Original" };
    const queryKey = threadMessagesQuery(threadId).queryKey;
    queryClient.setQueryData(
      queryKey,
      createLatestThreadHistory(page([originalMessage]), threadId),
    );
    const stop = installThreadReconciliation(queryClient);
    const editedMessage = { ...originalMessage, content: "Edited" };

    ipc.messageListener()?.(editedMessage);

    expect(queryClient.getQueryData(queryKey)).toEqual(
      createLatestThreadHistory(page([editedMessage]), threadId),
    );

    stop();
    queryClient.clear();
  });
});
