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
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { Composer } from "@/primitive/composer";
import {
  threadMessagesQuery,
  useIsTurnOperationPending,
  useRetryTurn,
  useSubmitTurn,
} from "./query";
import { deriveThreadViewState } from "./thread-view-state";

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

export function ThreadView({
  threadId,
  model,
  modelPending,
  composerControls,
}: {
  threadId: string;
  model: ModelReference | null;
  modelPending: boolean;
  composerControls: ReactNode;
}) {
  const messagesQuery = useSuspenseInfiniteQuery(threadMessagesQuery(threadId));
  const submitTurnMutation = useSubmitTurn(threadId);
  const retryTurnMutation = useRetryTurn(threadId);
  const turnOperationPending = useIsTurnOperationPending(threadId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const composerInputId = useId();
  const sendErrorId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const retryTurnId = retryTurnMutation.variables?.turnId;
  const retryStatus: "pending" | "failed" | null = retryTurnMutation.isPending
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
        hasModel: model !== null && !modelPending,
      }),
    [messagesQuery.data.pages, model, modelPending, retryStatus, retryTurnId],
  );
  const operationPending = turnOperationPending || threadView.replyPending;

  useLayoutEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
    }
  }, [threadView.latestMessageId]);

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (operationPending || !draft.trim() || !model || modelPending) {
      return;
    }

    const content = draft;

    setSendError(null);
    retryTurnMutation.reset();

    try {
      await submitTurnMutation.mutateAsync({
        content,
        model: { providerId: model.providerId, modelId: model.modelId },
      });
      setDraft((currentDraft) => (currentDraft === content ? "" : currentDraft));
    } catch (cause) {
      reportError("thread.turn.submit", cause);
      setSendError("Could not send the message.");
    }
  }

  async function retryReply(turnId: string) {
    if (operationPending || !model || modelPending) {
      return;
    }

    retryTurnMutation.reset();
    setSendError(null);

    try {
      await retryTurnMutation.mutateAsync({
        turnId,
        model: { providerId: model.providerId, modelId: model.modelId },
      });
    } catch (cause) {
      reportError("thread.turn.retry", cause);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section aria-label="Thread" {...stylex.props(styles.root)}>
      <div ref={viewport} {...stylex.props(styles.viewport)}>
        <div {...stylex.props(styles.messageBody)}>
          {messagesQuery.hasNextPage ? (
            <div {...stylex.props(styles.loadOlder)}>
              <Button
                type="button"
                variant="ghost"
                disabled={messagesQuery.isFetchingNextPage}
                onClick={() => void messagesQuery.fetchNextPage()}
              >
                {messagesQuery.isFetchingNextPage ? "Loading…" : "Load older messages"}
              </Button>
            </div>
          ) : null}

          {messagesQuery.isFetchNextPageError ? (
            <p role="alert" {...stylex.props(styles.pageError)}>
              Could not load older messages.
            </p>
          ) : null}

          {threadView.messages.length === 0 ? (
            <div {...stylex.props(styles.empty)}>
              <p {...stylex.props(styles.emptyDescription)}>No messages yet.</p>
            </div>
          ) : (
            <ol {...stylex.props(styles.messageList)}>
              {threadView.messages.map(({ message, fromUser, reply }) => {
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
                          role={message.id === threadView.latestMessageId ? "status" : undefined}
                          {...stylex.props(
                            styles.replyStatus,
                            reply.generation.status === GenerationStatus.Failed &&
                              styles.replyFailure,
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
            </ol>
          )}
        </div>
      </div>

      <div {...stylex.props(styles.composerShell)}>
        <Composer onSubmit={sendMessage}>
          <Composer.Label htmlFor={composerInputId}>Message</Composer.Label>
          <Composer.Input
            id={composerInputId}
            value={draft}
            maxLength={threadView.messageContentMaxLength}
            aria-describedby={sendError ? sendErrorId : undefined}
            onChange={(event) => {
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
              disabled={!model || modelPending || operationPending || !draft.trim()}
            />
          </Composer.Footer>
        </Composer>
      </div>
    </section>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  messageBody: {
    marginInline: "auto",
    maxWidth: "42rem",
    minHeight: "100%",
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
    flexDirection: "column",
    justifyContent: "center",
    minHeight: "100%",
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
    flexShrink: 0,
    marginInline: "auto",
    maxWidth: "42rem",
    paddingBlock: "0 1.5rem",
    paddingInline: "1.5rem",
    width: "100%",
  },
});
