import { ThreadMessageAuthor } from "@jaquelene/ipc/renderer";
import { Button, formatTimestamp } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { threadMessagesQuery, useAppendUserMessage } from "./query";

const THREAD_MESSAGE_CONTENT_MAX_LENGTH = 100_000;

export function ThreadView({ threadId }: { threadId: string }) {
  const messagesQuery = useSuspenseInfiniteQuery(threadMessagesQuery(threadId));
  const appendMessageMutation = useAppendUserMessage();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const composerId = useId();
  const sendErrorId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const messages = messagesQuery.data.pages.toReversed().flatMap((page) => page.messages);
  const latestMessageId = messages.at(-1)?.id;

  useLayoutEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
    }
  }, [latestMessageId]);

  async function sendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (appendMessageMutation.isPending) {
      return;
    }

    const content = draft;

    if (!content.trim()) {
      setSendError("Write a message before sending it.");
      return;
    }

    setSendError(null);

    try {
      await appendMessageMutation.mutateAsync({ threadId, content });
      setDraft((currentDraft) => (currentDraft === content ? "" : currentDraft));
    } catch (cause) {
      reportError("thread.message.send", cause);
      setSendError("Could not send the message.");
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

          {messages.length === 0 ? (
            <div {...stylex.props(styles.empty)}>
              <p {...stylex.props(styles.emptyDescription)}>No messages yet.</p>
            </div>
          ) : (
            <ol {...stylex.props(styles.messageList)}>
              {messages.map((message) => {
                const fromUser = message.author === ThreadMessageAuthor.User;

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
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <div {...stylex.props(styles.composerShell)}>
        <form onSubmit={sendMessage} {...stylex.props(styles.composer)}>
          <div {...stylex.props(styles.composerField)}>
            <label htmlFor={composerId} {...stylex.props(styles.visuallyHidden)}>
              Message
            </label>
            <textarea
              id={composerId}
              value={draft}
              rows={3}
              maxLength={THREAD_MESSAGE_CONTENT_MAX_LENGTH}
              placeholder="Write a message…"
              aria-describedby={sendError ? sendErrorId : undefined}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
              {...stylex.props(styles.textarea)}
            />
            {sendError ? (
              <p id={sendErrorId} role="alert" {...stylex.props(styles.sendError)}>
                {sendError}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={appendMessageMutation.isPending}>
            {appendMessageMutation.isPending ? "Sending…" : "Send"}
          </Button>
        </form>
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
  composerShell: {
    backgroundColor: tokens.surface,
    borderTopColor: tokens.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    flexShrink: 0,
  },
  composer: {
    alignItems: "flex-end",
    display: "flex",
    gap: "0.75rem",
    marginInline: "auto",
    maxWidth: "42rem",
    padding: "1rem 1.5rem",
    width: "100%",
  },
  composerField: {
    flex: 1,
    minWidth: 0,
  },
  textarea: {
    appearance: "none",
    backgroundColor: {
      default: `color-mix(in oklab, ${tokens.foreground} 3.5%, transparent)`,
      ":focus": `color-mix(in oklab, ${tokens.foreground} 5%, transparent)`,
    },
    borderColor: {
      default: `color-mix(in oklab, ${tokens.foreground} 10%, transparent)`,
      ":focus": `color-mix(in oklab, ${tokens.accent} 45%, transparent)`,
    },
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    caretColor: tokens.accent,
    color: tokens.foreground,
    display: "block",
    fontFamily: "inherit",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    minHeight: "3.75rem",
    outline: "none",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
    resize: "vertical",
    width: "100%",
    "::placeholder": {
      color: tokens.muted,
    },
  },
  sendError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
  },
  visuallyHidden: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
