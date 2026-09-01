import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import type { SubmitTurnVariables } from "./query";
import { PendingThreadMessageRow, ThreadMessageRow } from "./thread-message";
import type { ThreadViewState } from "./thread-view-state";

const timelineGap = 16;
const timelinePadding = 24;
const estimatedCharactersPerLine = 32;
const estimatedLineHeight = 20;
const estimatedMessageChrome = 42;
const estimatedReplyStateHeight = 22;

type ThreadMessageView = ThreadViewState["messages"][number];
type ThreadTimelineItem =
  | Readonly<{
      key: `message:${string}`;
      type: "message";
      value: ThreadMessageView;
    }>
  | Readonly<{
      key: `submission:${string}`;
      type: "submission";
      value: SubmitTurnVariables;
    }>;

type ThreadTimelineSnapshot = Readonly<{
  latestMessageId: string | null;
  replyPending: boolean;
  submissionId: string | null;
}>;

type ThreadTimelineProps = Readonly<{
  view: ThreadViewState;
  pendingSubmission: SubmitTurnVariables | null;
  viewport: RefObject<HTMLDivElement | null>;
  pinnedToEnd: RefObject<boolean>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  historyNavigationPending: boolean;
  retryPending: boolean;
  loadOlder: () => Promise<void>;
  retryReply: (turnId: string) => Promise<void>;
}>;

function estimateTimelineItemSize(item: ThreadTimelineItem | undefined) {
  if (!item) {
    return estimatedLineHeight + estimatedMessageChrome;
  }

  const content = item.type === "message" ? item.value.message.content : item.value.content;
  const lineCount = Math.max(1, Math.ceil(content.length / estimatedCharactersPerLine));
  const hasReplyState = item.type === "submission" || item.value.reply !== null;

  return (
    lineCount * estimatedLineHeight +
    estimatedMessageChrome +
    (hasReplyState ? estimatedReplyStateHeight : 0)
  );
}

function isScrolledToEnd(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1;
}

export const ThreadTimeline = memo(function ThreadTimeline({
  view,
  pendingSubmission,
  viewport,
  pinnedToEnd,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  historyNavigationPending,
  retryPending,
  loadOlder,
  retryReply,
}: ThreadTimelineProps) {
  const historyControls = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const timelineSnapshot = useRef<ThreadTimelineSnapshot | null>(null);
  const loadingOlder = useRef(false);
  const itemOrigin = useRef<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  const optimisticSubmission = view.replyPending ? null : pendingSubmission;
  const hasHistoryControls = hasNextPage || isFetchNextPageError;
  const paddingStart = hasHistoryControls ? 0 : timelinePadding;
  const items = useMemo<ThreadTimelineItem[]>(() => {
    const messages: ThreadTimelineItem[] = view.messages.map((value) => ({
      key: `message:${value.message.id}`,
      type: "message",
      value,
    }));

    if (optimisticSubmission) {
      messages.push({
        key: `submission:${optimisticSubmission.clientId}`,
        type: "submission",
        value: optimisticSubmission,
      });
    }

    return messages;
  }, [optimisticSubmission, view.messages]);
  const hasItems = items.length > 0;
  const getItemKey = useCallback((index: number) => items[index]?.key ?? index, [items]);
  const estimateSize = useCallback(
    (index: number) => estimateTimelineItemSize(items[index]),
    [items],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    anchorTo: "end",
    count: items.length,
    directDomUpdates: true,
    estimateSize,
    gap: timelineGap,
    getItemKey,
    getScrollElement: () => viewport.current,
    overscan: 2,
    paddingEnd: timelinePadding,
    paddingStart,
    scrollMargin: scrollMargin ?? 0,
    useFlushSync: false,
  });
  const setMessageList = useCallback(
    (node: HTMLOListElement | null) => {
      messageList.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer],
  );

  const synchronizeScrollMargin = useCallback(() => {
    const scrollViewport = viewport.current;
    const list = messageList.current;

    if (!scrollViewport || !list) {
      return;
    }

    const nextScrollMargin = Math.max(
      0,
      Math.round(
        (list.getBoundingClientRect().top -
          scrollViewport.getBoundingClientRect().top +
          scrollViewport.scrollTop) *
          100,
      ) / 100,
    );
    const nextItemOrigin = nextScrollMargin + paddingStart;
    const previousItemOrigin = itemOrigin.current;

    if (previousItemOrigin !== null && timelineSnapshot.current !== null) {
      scrollViewport.scrollTop += nextItemOrigin - previousItemOrigin;
    }

    itemOrigin.current = nextItemOrigin;

    setScrollMargin((current) => (current === nextScrollMargin ? current : nextScrollMargin));
  }, [paddingStart, viewport]);

  useLayoutEffect(() => {
    if (!hasItems) {
      itemOrigin.current = null;
      timelineSnapshot.current = null;
      setScrollMargin(null);
      return;
    }

    synchronizeScrollMargin();
    const scrollViewport = viewport.current;

    if (!scrollViewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(synchronizeScrollMargin);
    resizeObserver.observe(scrollViewport);

    if (historyControls.current) {
      resizeObserver.observe(historyControls.current);
    }

    return () => resizeObserver.disconnect();
  }, [hasHistoryControls, hasItems, synchronizeScrollMargin, viewport]);

  useLayoutEffect(() => {
    if (scrollMargin === null || !hasItems) {
      return;
    }

    const previous = timelineSnapshot.current;
    const clientId = optimisticSubmission?.clientId ?? null;
    const ownSubmissionAdded = clientId !== null && clientId !== previous?.submissionId;
    const timelineChanged =
      view.latestMessageId !== previous?.latestMessageId ||
      view.replyPending !== previous?.replyPending;
    const shouldScrollToEnd =
      previous === null || ownSubmissionAdded || (pinnedToEnd.current && timelineChanged);

    if (shouldScrollToEnd) {
      virtualizer.scrollToEnd();
      pinnedToEnd.current = true;
    }

    timelineSnapshot.current = {
      latestMessageId: view.latestMessageId,
      replyPending: view.replyPending,
      submissionId: clientId ?? previous?.submissionId ?? null,
    };
  }, [
    hasItems,
    optimisticSubmission?.clientId,
    pinnedToEnd,
    scrollMargin,
    view.latestMessageId,
    view.replyPending,
    virtualizer,
  ]);

  async function loadOlderMessages() {
    if (loadingOlder.current) {
      return;
    }

    loadingOlder.current = true;

    try {
      await loadOlder();
    } catch (cause) {
      reportError("thread.messages.load-older", cause);
    } finally {
      loadingOlder.current = false;
    }
  }

  return (
    <div
      ref={viewport}
      onScroll={(event) => {
        pinnedToEnd.current = isScrolledToEnd(event.currentTarget);
      }}
      {...stylex.props(styles.viewport)}
    >
      <div {...stylex.props(styles.messageBody)}>
        {hasHistoryControls ? (
          <div ref={historyControls} {...stylex.props(styles.historyControls)}>
            {hasNextPage ? (
              <Button
                type="button"
                variant="ghost"
                disabled={isFetchingNextPage || historyNavigationPending}
                onClick={() => void loadOlderMessages()}
              >
                {isFetchingNextPage ? "Loading…" : "Load older messages"}
              </Button>
            ) : null}
            {isFetchNextPageError ? (
              <p role="alert" {...stylex.props(styles.pageError)}>
                Could not load older messages.
              </p>
            ) : null}
          </div>
        ) : null}

        {!hasItems ? (
          <div {...stylex.props(styles.empty)}>
            <p {...stylex.props(styles.emptyDescription)}>No messages yet.</p>
          </div>
        ) : (
          <ol ref={setMessageList} {...stylex.props(styles.messageList)}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index];

              if (!item) {
                return null;
              }

              if (item.type === "submission") {
                return (
                  <li
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    aria-posinset={virtualItem.index + 1}
                    aria-setsize={items.length}
                    {...stylex.props(styles.virtualItem, styles.message, styles.userMessage)}
                  >
                    <PendingThreadMessageRow submission={item.value} />
                  </li>
                );
              }

              const { message, fromUser, reply } = item.value;

              return (
                <li
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  aria-posinset={virtualItem.index + 1}
                  aria-setsize={items.length}
                  {...stylex.props(
                    styles.virtualItem,
                    styles.message,
                    fromUser ? styles.userMessage : styles.assistantMessage,
                  )}
                >
                  <ThreadMessageRow
                    message={message}
                    fromUser={fromUser}
                    reply={reply}
                    announceReply={message.id === view.latestMessageId}
                    retryPending={retryPending}
                    retryReply={retryReply}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
});

const styles = stylex.create({
  viewport: {
    flex: 1,
    minHeight: 0,
    overflowAnchor: "none",
    overflowY: "auto",
    scrollbarGutter: "stable",
  },
  messageBody: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
  },
  historyControls: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginInline: "auto",
    maxWidth: "42rem",
    paddingBlock: "1.5rem 1rem",
    paddingInline: "1.5rem",
    width: "100%",
  },
  pageError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    textAlign: "center",
  },
  empty: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    padding: "1.5rem",
    textAlign: "center",
  },
  emptyDescription: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.25rem",
  },
  messageList: {
    flexShrink: 0,
    marginInline: "auto",
    maxWidth: "42rem",
    position: "relative",
    width: "100%",
  },
  virtualItem: {
    boxSizing: "border-box",
    left: 0,
    paddingInline: "1.5rem",
    position: "absolute",
    top: 0,
    width: "100%",
  },
  message: {
    display: "flex",
    flexDirection: "column",
  },
  userMessage: {
    alignItems: "flex-end",
  },
  assistantMessage: {
    alignItems: "flex-start",
  },
});
