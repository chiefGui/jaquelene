import {
  GenerationFailureKind,
  GenerationStatus,
  type ModelReference,
  type TurnGeneration,
} from "@jaquelene/ipc/renderer";
import { Button, formatTimestamp } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SubmitEvent,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { Composer } from "@/feature/composer/composer";
import {
  threadMessagesQuery,
  useIsTurnOperationPending,
  usePendingTurnSubmission,
  useRetryTurn,
  useSubmitTurn,
  type SubmitTurnVariables,
} from "./query";
import { deriveThreadViewState, type ThreadViewState } from "./thread-view-state";

type RetryStatus = "pending" | "failed" | null;

function isScrolledToEnd(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1;
}

function scrollToEnd(viewport: HTMLElement) {
  viewport.scrollTop = viewport.scrollHeight;
}

function replyStatusText(generation: TurnGeneration, retrying: boolean) {
  if (retrying) {
    return "Retrying…";
  }

  switch (generation.status) {
    case GenerationStatus.Pending:
      return "Generating reply…";
    case GenerationStatus.Completed:
      return "Reply generated.";
    case GenerationStatus.Failed:
      return generation.failureKind === GenerationFailureKind.Interrupted
        ? "Reply interrupted."
        : "Couldn’t generate a reply.";
  }
}

type ThreadTimelineProps = Readonly<{
  view: ThreadViewState;
  pendingSubmission: SubmitTurnVariables | null;
  viewport: RefObject<HTMLElement | null>;
  pinnedToEnd: RefObject<boolean>;
  modelAvailable: boolean;
  retryStatus: RetryStatus;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  operationPending: boolean;
  loadOlder: () => Promise<unknown>;
  retryReply: (turnId: string) => Promise<void>;
}>;

const ThreadTimeline = memo(function ThreadTimeline({
  view,
  pendingSubmission,
  viewport,
  pinnedToEnd,
  modelAvailable,
  retryStatus,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  operationPending,
  loadOlder,
  retryReply,
}: ThreadTimelineProps) {
  const messageList = useRef<HTMLOListElement>(null);
  const initialScrollComplete = useRef(false);
  const lastPendingSubmissionId = useRef<string | null>(null);
  const loadingOlder = useRef(false);
  const paginationAnchor = useRef<{
    element: Element;
    top: number;
  } | null>(null);
  const [paginationRevision, setPaginationRevision] = useState(0);
  const optimisticSubmission = view.replyPending ? null : pendingSubmission;
  const empty = view.messages.length === 0 && !optimisticSubmission;

  useLayoutEffect(() => {
    const element = viewport.current;

    if (!element || initialScrollComplete.current) {
      return;
    }

    scrollToEnd(element);
    initialScrollComplete.current = true;
  }, [viewport]);

  useLayoutEffect(() => {
    const element = viewport.current;
    const clientId = optimisticSubmission?.clientId ?? null;

    if (!element || !clientId || clientId === lastPendingSubmissionId.current) {
      return;
    }

    scrollToEnd(element);
    lastPendingSubmissionId.current = clientId;
  }, [optimisticSubmission?.clientId, viewport]);

  useLayoutEffect(() => {
    const element = viewport.current;

    if (element && pinnedToEnd.current) {
      scrollToEnd(element);
    }
  }, [modelAvailable, pinnedToEnd, retryStatus, view.latestMessageId, view.replyPending, viewport]);

  useLayoutEffect(() => {
    const element = viewport.current;
    const anchor = paginationAnchor.current;

    if (!element || !anchor) {
      return;
    }

    if (element.contains(anchor.element)) {
      element.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
    }

    paginationAnchor.current = null;
  }, [paginationRevision, viewport]);

  async function loadOlderMessages() {
    if (loadingOlder.current) {
      return;
    }

    loadingOlder.current = true;
    const element = viewport.current;
    const anchorElement = messageList.current?.firstElementChild;

    if (element && anchorElement) {
      paginationAnchor.current = {
        element: anchorElement,
        top: anchorElement.getBoundingClientRect().top,
      };
    }

    try {
      await loadOlder();
    } catch (cause) {
      reportError("thread.messages.load-older", cause);
    } finally {
      loadingOlder.current = false;
      setPaginationRevision((revision) => revision + 1);
    }
  }

  return (
    <div {...stylex.props(styles.messageBody)}>
      {hasNextPage ? (
        <div {...stylex.props(styles.loadOlder)}>
          <Button
            type="button"
            variant="ghost"
            disabled={isFetchingNextPage}
            onClick={() => void loadOlderMessages()}
          >
            {isFetchingNextPage ? "Loading…" : "Load older messages"}
          </Button>
        </div>
      ) : null}

      {isFetchNextPageError ? (
        <p role="alert" {...stylex.props(styles.pageError)}>
          Could not load older messages.
        </p>
      ) : null}

      {empty ? (
        <div {...stylex.props(styles.empty)}>
          <p {...stylex.props(styles.emptyDescription)}>No messages yet.</p>
        </div>
      ) : (
        <ol ref={messageList} {...stylex.props(styles.messageList)}>
          {view.messages.map(({ message, fromUser, reply }) => {
            return (
              <li
                key={message.id}
                {...stylex.props(
                  styles.message,
                  fromUser ? styles.userMessage : styles.assistantMessage,
                )}
              >
                <article
                  aria-label={fromUser ? "You" : "Assistant"}
                  {...stylex.props(
                    styles.bubble,
                    fromUser ? styles.userBubble : styles.assistantBubble,
                  )}
                >
                  <p {...stylex.props(styles.content)}>{message.content}</p>
                </article>
                <time
                  dateTime={new Date(message.createdAt).toISOString()}
                  {...stylex.props(styles.timestamp)}
                >
                  {formatTimestamp(message.createdAt)}
                </time>
                {reply ? (
                  <div {...stylex.props(styles.replyState)}>
                    <p
                      role={message.id === view.latestMessageId ? "status" : undefined}
                      {...stylex.props(
                        styles.replyStatus,
                        reply.generation.status === GenerationStatus.Failed && styles.replyFailure,
                      )}
                    >
                      {replyStatusText(reply.generation, reply.retrying)}
                    </p>
                    {reply.canRetry && !reply.retrying ? (
                      <Button
                        type="button"
                        variant="ghost"
                        style={styles.retryButton}
                        disabled={operationPending}
                        onClick={() => void retryReply(message.turnId)}
                      >
                        Retry
                      </Button>
                    ) : null}
                    {reply.retryFailed ? (
                      <p role="alert" {...stylex.props(styles.retryError)}>
                        Couldn’t retry the reply.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}

          {optimisticSubmission ? (
            <li
              key={optimisticSubmission.clientId}
              {...stylex.props(styles.message, styles.userMessage)}
            >
              <article aria-label="You" {...stylex.props(styles.bubble, styles.userBubble)}>
                <p {...stylex.props(styles.content)}>{optimisticSubmission.content}</p>
              </article>
              <time
                dateTime={new Date(optimisticSubmission.submittedAt).toISOString()}
                {...stylex.props(styles.timestamp)}
              >
                {formatTimestamp(optimisticSubmission.submittedAt)}
              </time>
              <div {...stylex.props(styles.replyState)}>
                <p role="status" {...stylex.props(styles.replyStatus)}>
                  Sending…
                </p>
              </div>
            </li>
          ) : null}
        </ol>
      )}
    </div>
  );
});

type ThreadComposerProps = Readonly<{
  threadId: string;
  model: ModelReference | null;
  modelPending: boolean;
  operationPending: boolean;
  messageContentMaxLength: number;
  composerControls: ReactNode;
  viewport: RefObject<HTMLElement | null>;
  pinnedToEnd: RefObject<boolean>;
  onSubmissionAccepted: () => void;
}>;

const ThreadComposer = memo(function ThreadComposer({
  threadId,
  model,
  modelPending,
  operationPending,
  messageContentMaxLength,
  composerControls,
  viewport,
  pinnedToEnd,
  onSubmissionAccepted,
}: ThreadComposerProps) {
  const submitTurnMutation = useSubmitTurn(threadId, onSubmissionAccepted);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const acceptingSubmission = useRef(false);
  const draftRevision = useRef(0);
  const composerInputId = useId();
  const sendErrorId = useId();
  const composerShell = useRef<HTMLDivElement>(null);
  const submissionBlocked = operationPending || modelPending;

  useLayoutEffect(() => {
    const scrollViewport = viewport.current;
    const shell = composerShell.current;

    if (!scrollViewport || !shell) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (pinnedToEnd.current) {
        scrollToEnd(scrollViewport);
      }
    });
    resizeObserver.observe(shell);

    return () => resizeObserver.disconnect();
  }, [pinnedToEnd, viewport]);

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionBlocked || acceptingSubmission.current || !model) {
      return;
    }

    const content = draft;

    if (!content.trim()) {
      return;
    }

    setSendError(null);
    const submittedRevision = draftRevision.current;
    setDraft("");
    acceptingSubmission.current = true;

    try {
      await submitTurnMutation.mutateAsync({
        clientId: crypto.randomUUID(),
        content,
        submittedAt: Date.now(),
        model: { providerId: model.providerId, modelId: model.modelId },
      });
    } catch (cause) {
      setDraft((currentDraft) =>
        draftRevision.current === submittedRevision ? content : currentDraft,
      );
      reportError("thread.turn.submit", cause);
      setSendError("Could not send the message.");
      return;
    } finally {
      acceptingSubmission.current = false;
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div ref={composerShell} {...stylex.props(styles.composerShell)}>
      <Composer pending={operationPending} onSubmit={sendMessage}>
        <Composer.Label htmlFor={composerInputId}>Message</Composer.Label>
        <Composer.Input
          id={composerInputId}
          value={draft}
          maxLength={messageContentMaxLength}
          aria-describedby={sendError ? sendErrorId : undefined}
          onChange={(event) => {
            draftRevision.current += 1;
            setDraft(event.currentTarget.value);
            setSendError(null);
          }}
          onKeyDown={handleComposerKeyDown}
        />
        <Composer.Footer>
          <Composer.Controls>
            {composerControls}
            {sendError ? (
              <Composer.Status id={sendErrorId} role="alert" tone="danger">
                {sendError}
              </Composer.Status>
            ) : null}
          </Composer.Controls>
          <Composer.Submit
            pending={operationPending}
            disabled={modelPending || !model || !draft.trim()}
          />
        </Composer.Footer>
      </Composer>
    </div>
  );
});

export function ThreadView({
  threadId,
  model,
  modelPending,
  composerControls,
  onSubmissionAccepted,
}: {
  threadId: string;
  model: ModelReference | null;
  modelPending: boolean;
  composerControls: ReactNode;
  onSubmissionAccepted: () => void;
}) {
  const messagesQuery = useSuspenseInfiniteQuery(threadMessagesQuery(threadId));
  const retryTurnMutation = useRetryTurn(threadId);
  const retryTurn = retryTurnMutation.mutateAsync;
  const resetRetry = retryTurnMutation.reset;
  const acceptingRetry = useRef(false);
  const turnOperationPending = useIsTurnOperationPending(threadId);
  const pendingSubmission = usePendingTurnSubmission(threadId);
  const viewport = useRef<HTMLElement>(null);
  const pinnedToEnd = useRef(true);
  const retryTurnId = retryTurnMutation.variables?.turnId;
  const retryStatus: RetryStatus = retryTurnMutation.isPending
    ? "pending"
    : retryTurnMutation.isError
      ? "failed"
      : null;
  const threadView = useMemo(
    () =>
      deriveThreadViewState({
        pages: messagesQuery.data.pages,
        retryActivity:
          retryTurnId && retryStatus ? { turnId: retryTurnId, status: retryStatus } : null,
        hasModel: model !== null,
      }),
    [messagesQuery.data.pages, model, retryStatus, retryTurnId],
  );
  const operationPending = turnOperationPending || threadView.replyPending;

  const retryReply = useCallback(
    async (turnId: string) => {
      if (operationPending || !model || modelPending || acceptingRetry.current) {
        return;
      }

      acceptingRetry.current = true;
      resetRetry();

      try {
        await retryTurn({
          turnId,
          model: { providerId: model.providerId, modelId: model.modelId },
        });
      } catch (cause) {
        reportError("thread.turn.retry", cause);
      } finally {
        acceptingRetry.current = false;
      }
    },
    [model, modelPending, operationPending, resetRetry, retryTurn],
  );

  const loadOlder = useCallback(() => messagesQuery.fetchNextPage(), [messagesQuery.fetchNextPage]);

  return (
    <section
      ref={viewport}
      aria-label="Thread"
      onScroll={(event) => {
        pinnedToEnd.current = isScrolledToEnd(event.currentTarget);
      }}
      {...stylex.props(styles.root)}
    >
      <ThreadTimeline
        key={`timeline:${threadId}`}
        view={threadView}
        pendingSubmission={pendingSubmission}
        viewport={viewport}
        pinnedToEnd={pinnedToEnd}
        modelAvailable={model !== null}
        retryStatus={retryStatus}
        hasNextPage={messagesQuery.hasNextPage}
        isFetchingNextPage={messagesQuery.isFetchingNextPage}
        isFetchNextPageError={messagesQuery.isFetchNextPageError}
        operationPending={operationPending || modelPending}
        loadOlder={loadOlder}
        retryReply={retryReply}
      />
      <ThreadComposer
        key={`composer:${threadId}`}
        threadId={threadId}
        model={model}
        modelPending={modelPending}
        operationPending={operationPending}
        messageContentMaxLength={threadView.messageContentMaxLength}
        composerControls={composerControls}
        viewport={viewport}
        pinnedToEnd={pinnedToEnd}
        onSubmissionAccepted={onSubmissionAccepted}
      />
    </section>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    scrollbarGutter: "stable",
  },
  messageBody: {
    display: "flex",
    flex: "1 0 auto",
    flexDirection: "column",
    marginInline: "auto",
    maxWidth: "42rem",
    padding: "1.5rem",
    width: "100%",
  },
  loadOlder: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "1rem",
  },
  pageError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBottom: "1rem",
    textAlign: "center",
  },
  empty: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    textAlign: "center",
  },
  emptyDescription: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.25rem",
  },
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
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
  bubble: {
    borderRadius: tokens.radiusLarge,
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    maxWidth: "82%",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
  },
  userBubble: {
    backgroundColor: `color-mix(in oklab, ${tokens.accent} 22%, ${tokens.surfaceRaised})`,
  },
  assistantBubble: {
    backgroundColor: tokens.surfaceRaised,
    borderColor: tokens.surfaceRaisedBorder,
    borderStyle: "solid",
    borderWidth: 1,
  },
  content: {
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  timestamp: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.375rem",
  },
  replyState: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    marginTop: "0.375rem",
  },
  replyStatus: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  replyFailure: {
    color: tokens.danger,
  },
  retryButton: {
    height: "2rem",
    paddingInline: "0.5rem",
  },
  retryError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  composerShell: {
    bottom: 0,
    flexShrink: 0,
    marginInline: "auto",
    maxWidth: "42rem",
    paddingBlock: "0 1.5rem",
    paddingInline: "1.5rem",
    position: "sticky",
    width: "100%",
    zIndex: 1,
  },
});
