import { Button } from "@jaquelene/ui";
import type { ModelConfigurationSelection } from "@jaquelene/ipc/renderer";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
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
import type { RegenerationModelChoice } from "./regeneration-model";
import { threadLayout } from "./thread-layout.stylex";
import { PendingThreadMessageRow, ThreadMessageRow } from "./thread-message";
import type { ThreadMessageEditSession, ThreadMessageEditorProps } from "./thread-message-editor";
import { estimateThreadTimelineItemSize } from "./thread-timeline-estimate";
import { threadScrollDestination, type ThreadTimelineScrollSnapshot } from "./thread-scroll";
import type { ThreadViewState } from "./thread-view-state";

const timelineGap = 16;
const timelinePadding = 24;

type ThreadMessageView = ThreadViewState["messages"][number];
type ThreadTimelineItem =
  | Readonly<{
      key: `message:${string}`;
      type: "message";
      value: ThreadMessageView;
      estimatedSize: number;
    }>
  | Readonly<{
      key: `submission:${string}`;
      type: "submission";
      value: SubmitTurnVariables;
      estimatedSize: number;
    }>;

type ThreadTimelineProps = Readonly<{
  view: ThreadViewState;
  scrollRequest: number;
  pendingSubmission: SubmitTurnVariables | null;
  bottomInset: number;
  viewport: HTMLDivElement | null;
  pinnedToEnd: RefObject<boolean>;
  latestHistory: boolean;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  olderMessagesFailed: boolean;
  historyNavigationPending: boolean;
  retryPending: boolean;
  regenerationRequestPending: boolean;
  responseActionsDisabled: boolean;
  editSession: ThreadMessageEditSession | null;
  editPending: boolean;
  deletePending: boolean;
  messageMaxCodeUnits: number;
  beginEdit: (message: ThreadMessageView["message"]) => void;
  cancelEdit: () => void;
  saveEdit: (messageId: string, content: string) => Promise<void>;
  deleteFromUserMessage: (userMessageId: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  regenerateResponse: (
    assistantMessageId: string,
    configuration: ModelConfigurationSelection,
    instructions?: string,
  ) => Promise<boolean>;
  regenerationModel: RegenerationModelChoice;
  retryReply: (turnId: string) => Promise<void>;
}>;

export const ThreadTimeline = memo(function ThreadTimeline({
  view,
  scrollRequest,
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
  regenerationRequestPending,
  responseActionsDisabled,
  editSession,
  editPending,
  deletePending,
  messageMaxCodeUnits,
  beginEdit,
  cancelEdit,
  saveEdit,
  deleteFromUserMessage,
  loadOlder,
  regenerateResponse,
  regenerationModel,
  retryReply,
}: ThreadTimelineProps) {
  const historyControls = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLOListElement>(null);
  const activeEditorItem = useRef<HTMLLIElement>(null);
  const timelineSnapshot = useRef<ThreadTimelineScrollSnapshot | null>(null);
  const itemOrigin = useRef<number | null>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  const replyPending = view.pendingGenerationIntent !== null;
  let optimisticSubmission = pendingSubmission;
  if (replyPending) {
    optimisticSubmission = null;
  }
  const hasHistoryControls = hasOlderMessages || olderMessagesFailed;
  const paddingStart = hasHistoryControls ? 0 : timelinePadding;
  const items = useMemo<ThreadTimelineItem[]>(() => {
    const messages: ThreadTimelineItem[] = view.messages.map((value) => ({
      estimatedSize: estimateThreadTimelineItemSize(
        value.message.content,
        value.replyFailure !== null || value.regeneration?.status === "failed",
      ),
      key: `message:${value.message.id}`,
      type: "message",
      value,
    }));

    if (optimisticSubmission) {
      messages.push({
        estimatedSize: estimateThreadTimelineItemSize(optimisticSubmission.content, false),
        key: `submission:${optimisticSubmission.clientId}`,
        type: "submission",
        value: optimisticSubmission,
      });
    }

    return messages;
  }, [optimisticSubmission, view.messages]);
  const hasItems = items.length > 0;
  const getItemKey = useCallback((index: number) => items[index]!.key, [items]);
  const estimateSize = useCallback((index: number) => items[index]!.estimatedSize, [items]);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    anchorTo: "end",
    count: items.length,
    directDomUpdates: true,
    enabled: viewport !== null,
    estimateSize,
    gap: timelineGap,
    getItemKey,
    getScrollElement: () => viewport,
    overscan: 2,
    paddingEnd: timelinePadding + bottomInset,
    paddingStart,
    scrollPaddingEnd: timelinePadding + bottomInset,
    scrollPaddingStart: timelinePadding,
    scrollMargin: scrollMargin ?? 0,
    useFlushSync: false,
  });
  let activeEditorIndex: number | null = null;

  if (editSession) {
    const editItemKey = `message:${editSession.messageId}`;
    const editItemIndex = items.findIndex((item) => item.key === editItemKey);

    if (editItemIndex >= 0) {
      activeEditorIndex = editItemIndex;
    }
  }

  const setActiveEditorItem = useCallback(
    (node: HTMLLIElement | null) => {
      activeEditorItem.current = node;
      virtualizer.measureElement(node);
    },
    [virtualizer],
  );
  const revealActiveEditor = useCallback(() => {
    const item = activeEditorItem.current;

    if (!item || activeEditorIndex === null) {
      return;
    }

    // The default synchronous measurement path reuses its cached size. Refresh
    // from layout so the lazy editor's first frame is included before scrolling.
    virtualizer.resizeItem(activeEditorIndex, item.offsetHeight);
    virtualizer.scrollToIndex(activeEditorIndex, { align: "auto" });
  }, [activeEditorIndex, virtualizer]);
  const setMessageList = useCallback(
    (node: HTMLOListElement | null) => {
      messageList.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer],
  );

  const synchronizeScrollMargin = useCallback(() => {
    const list = messageList.current;

    if (!viewport || !list) {
      return;
    }

    const nextScrollMargin = Math.max(
      0,
      Math.round(
        (list.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop) *
          100,
      ) / 100,
    );
    const nextItemOrigin = nextScrollMargin + paddingStart;
    const previousItemOrigin = itemOrigin.current;

    if (previousItemOrigin !== null && timelineSnapshot.current !== null) {
      viewport.scrollTop += nextItemOrigin - previousItemOrigin;
    }

    itemOrigin.current = nextItemOrigin;

    setScrollMargin(nextScrollMargin);
  }, [paddingStart, viewport]);

  useLayoutEffect(() => {
    const list = messageList.current;

    if (!viewport || !list) {
      return;
    }

    const revealEnd = () => {
      if (
        pinnedToEnd.current &&
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 1
      ) {
        virtualizer.scrollToEnd();
      }
    };
    const observer = new ResizeObserver(revealEnd);
    observer.observe(viewport);
    observer.observe(list);

    return () => observer.disconnect();
  }, [hasItems, pinnedToEnd, viewport, virtualizer]);

  useLayoutEffect(() => {
    if (!hasItems) {
      itemOrigin.current = null;
      timelineSnapshot.current = null;
      setScrollMargin(null);
      return;
    }

    synchronizeScrollMargin();
    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(synchronizeScrollMargin);
    resizeObserver.observe(viewport);

    if (historyControls.current) {
      resizeObserver.observe(historyControls.current);
    }

    return () => resizeObserver.disconnect();
  }, [hasHistoryControls, hasItems, synchronizeScrollMargin, viewport]);

  useLayoutEffect(() => {
    if (scrollMargin === null || !hasItems) {
      return;
    }

    const oldestMessage = view.messages[0]?.message;
    const newestMessage = view.messages.at(-1)?.message;
    const current: ThreadTimelineScrollSnapshot = {
      bottomInset,
      latestMessageId: view.latestMessageId,
      oldestSequence: oldestMessage?.sequence ?? null,
      newestSequence: newestMessage?.sequence ?? null,
      replyPending,
      scrollRequest,
    };
    const destination = threadScrollDestination(
      timelineSnapshot.current,
      current,
      latestHistory,
      pinnedToEnd.current,
    );

    if (destination === "end") {
      pinnedToEnd.current = true;
      virtualizer.scrollToEnd();
    } else if (destination === "start") {
      pinnedToEnd.current = false;
      virtualizer.scrollToIndex(0, { align: "start" });
    }

    timelineSnapshot.current = current;
  }, [
    bottomInset,
    hasItems,
    latestHistory,
    scrollRequest,
    pinnedToEnd,
    scrollMargin,
    view.latestMessageId,
    view.messages,
    replyPending,
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

            const { message, regeneration, replyFailure } = item.value;
            let editor: ThreadMessageEditorProps | null = null;

            if (editSession?.messageId === message.id) {
              let onDelete: ThreadMessageEditorProps["onDelete"] = null;

              if (message.author === "user") {
                onDelete = () => deleteFromUserMessage(message.id);
              }

              editor = {
                session: editSession,
                maxLength: messageMaxCodeUnits,
                pending: editPending || deletePending,
                onCancel: cancelEdit,
                onDelete,
                onReady: revealActiveEditor,
                onSave: (content) => saveEdit(message.id, content),
              };
            }

            let itemRef = virtualizer.measureElement;

            if (editor) {
              itemRef = setActiveEditorItem;
            }

            return (
              <li
                key={virtualItem.key}
                ref={itemRef}
                data-index={virtualItem.index}
                aria-posinset={virtualItem.index + 1}
                aria-setsize={items.length}
                {...stylex.props(threadLayout.gutter, styles.virtualItem)}
              >
                <ThreadMessageRow
                  message={message}
                  regeneration={regeneration}
                  replyFailure={replyFailure}
                  announceReplyFailure={message.id === view.latestMessageId}
                  actionsDisabled={historyNavigationPending}
                  regenerationRequestPending={regenerationRequestPending}
                  responseActionsDisabled={responseActionsDisabled}
                  regenerateResponse={regenerateResponse}
                  regenerationModel={regenerationModel}
                  retryPending={retryPending}
                  retryReply={retryReply}
                  editor={editor}
                  beginEdit={beginEdit}
                  deletePending={deletePending}
                  deleteFromUserMessage={deleteFromUserMessage}
                  hasFollowingItem={virtualItem.index + 1 < items.length}
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
    color: colors.foregroundDanger,
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
    color: colors.foregroundSecondary,
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
