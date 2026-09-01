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
import type { SubmitTurnVariables } from "./query";
import { threadLayout } from "./thread-layout.stylex";
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
  messageIds: ReadonlySet<string>;
  oldestSequence: number | null;
  newestSequence: number | null;
  replyPending: boolean;
  submissionId: string | null;
}>;

type ThreadTimelineProps = Readonly<{
  view: ThreadViewState;
  pendingSubmission: SubmitTurnVariables | null;
  bottomInset: number;
  viewport: RefObject<HTMLDivElement | null>;
  pinnedToEnd: RefObject<boolean>;
  latestHistory: boolean;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  olderMessagesFailed: boolean;
  historyNavigationPending: boolean;
  retryPending: boolean;
  loadOlder: () => Promise<void>;
  retryReply: (turnId: string) => Promise<void>;
}>;

function estimateTimelineItemSize(item: ThreadTimelineItem) {
  const content = item.type === "message" ? item.value.message.content : item.value.content;
  const lineCount = Math.max(1, Math.ceil(content.length / estimatedCharactersPerLine));
  const hasReplyState = item.type === "submission" || item.value.reply !== null;

  return (
    lineCount * estimatedLineHeight +
    estimatedMessageChrome +
    (hasReplyState ? estimatedReplyStateHeight : 0)
  );
}

export const ThreadTimeline = memo(function ThreadTimeline({
  view,
  pendingSubmission,
  bottomInset,
  viewport,
  pinnedToEnd,
  latestHistory,
  hasOlderMessages,
  loadingOlderMessages,
  olderMessagesFailed,
  historyNavigationPending,
  retryPending,
  loadOlder,
  retryReply,
}: ThreadTimelineProps) {
  const historyControls = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const timelineSnapshot = useRef<ThreadTimelineSnapshot | null>(null);
  const itemOrigin = useRef<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  const optimisticSubmission = view.replyPending ? null : pendingSubmission;
  const hasHistoryControls = hasOlderMessages || olderMessagesFailed;
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
  const getItemKey = useCallback((index: number) => items[index]!.key, [items]);
  const estimateSize = useCallback(
    (index: number) => estimateTimelineItemSize(items[index]!),
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
    paddingEnd: timelinePadding + bottomInset,
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
    const oldestMessage = view.messages[0]?.message;
    const newestMessage = view.messages.at(-1)?.message;
    const messageIds = new Set(view.messages.map(({ message }) => message.id));
    const sharesMessage = previous
      ? view.messages.some(({ message }) => previous.messageIds.has(message.id))
      : false;
    const replacedWindow =
      previous !== null && previous.messageIds.size > 0 && messageIds.size > 0 && !sharesMessage;
    const movedToOlderWindow =
      replacedWindow &&
      newestMessage !== undefined &&
      previous.oldestSequence !== null &&
      newestMessage.sequence < previous.oldestSequence;
    const movedToNewerWindow =
      replacedWindow &&
      oldestMessage !== undefined &&
      previous.newestSequence !== null &&
      oldestMessage.sequence > previous.newestSequence;
    const ownSubmissionAdded = clientId !== null && clientId !== previous?.submissionId;
    const timelineChanged =
      view.latestMessageId !== previous?.latestMessageId ||
      view.replyPending !== previous?.replyPending;
    const shouldScrollToEnd =
      previous === null ||
      ownSubmissionAdded ||
      (latestHistory && (movedToNewerWindow || (pinnedToEnd.current && timelineChanged)));

    if (movedToOlderWindow) {
      virtualizer.scrollToEnd();
      pinnedToEnd.current = true;
    } else if (movedToNewerWindow && !latestHistory) {
      virtualizer.scrollToIndex(0, { align: "start" });
      pinnedToEnd.current = false;
    } else if (shouldScrollToEnd) {
      virtualizer.scrollToEnd();
      pinnedToEnd.current = true;
    }

    timelineSnapshot.current = {
      latestMessageId: view.latestMessageId,
      messageIds,
      oldestSequence: oldestMessage?.sequence ?? null,
      newestSequence: newestMessage?.sequence ?? null,
      replyPending: view.replyPending,
      submissionId: clientId ?? previous?.submissionId ?? null,
    };
  }, [
    hasItems,
    latestHistory,
    optimisticSubmission?.clientId,
    pinnedToEnd,
    scrollMargin,
    view.latestMessageId,
    view.messages,
    view.replyPending,
    virtualizer,
  ]);

  return (
    <div {...stylex.props(styles.messageBody)}>
      {hasHistoryControls ? (
        <div
          ref={historyControls}
          {...stylex.props(threadLayout.column, threadLayout.gutter, styles.historyControls)}
        >
          {hasOlderMessages ? (
            <Button
              type="button"
              variant="ghost"
              style={styles.loadOlderAction}
              disabled={historyNavigationPending}
              onClick={() => void loadOlder()}
            >
              {loadingOlderMessages ? "Loading…" : "Load older messages"}
            </Button>
          ) : null}
          {olderMessagesFailed ? (
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
        <ol
          aria-label="Messages"
          ref={setMessageList}
          {...stylex.props(threadLayout.column, styles.messageList)}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]!;

            if (item.type === "submission") {
              return (
                <li
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  aria-posinset={virtualItem.index + 1}
                  aria-setsize={items.length}
                  {...stylex.props(threadLayout.gutter, styles.virtualItem)}
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
                {...stylex.props(threadLayout.gutter, styles.virtualItem)}
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
  );
});

const styles = stylex.create({
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
    paddingBlock: "1.5rem 1rem",
  },
  pageError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    textAlign: "center",
  },
  loadOlderAction: {
    minWidth: "9.5rem",
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
    position: "relative",
  },
  virtualItem: {
    boxSizing: "border-box",
    left: 0,
    position: "absolute",
    top: 0,
    width: "100%",
  },
});
