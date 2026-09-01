import {
  GenerationFailureKind,
  GenerationStatus,
  type ThreadMessage,
  type TurnGeneration,
} from "@jaquelene/ipc/renderer";
import { Button, formatTimestamp } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { memo } from "react";
import type { SubmitTurnVariables } from "./query";
import type { ThreadViewState } from "./thread-view-state";

type ThreadReplyView = ThreadViewState["messages"][number]["reply"];

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

const ThreadMessageContent = memo(function ThreadMessageContent({ content }: { content: string }) {
  return <p {...stylex.props(styles.content)}>{content}</p>;
});

export const ThreadMessageRow = memo(function ThreadMessageRow({
  message,
  fromUser,
  reply,
  announceReply,
  retryPending,
  retryReply,
}: Readonly<{
  message: ThreadMessage;
  fromUser: boolean;
  reply: ThreadReplyView;
  announceReply: boolean;
  retryPending: boolean;
  retryReply: (turnId: string) => Promise<void>;
}>) {
  return (
    <>
      <article
        aria-label={fromUser ? "You" : "Assistant"}
        {...stylex.props(styles.bubble, fromUser ? styles.userBubble : styles.assistantBubble)}
      >
        <ThreadMessageContent content={message.content} />
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
            role={announceReply ? "status" : undefined}
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
              disabled={retryPending}
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
    </>
  );
});

export const PendingThreadMessageRow = memo(function PendingThreadMessageRow({
  submission,
}: Readonly<{
  submission: SubmitTurnVariables;
}>) {
  return (
    <>
      <article aria-label="You" {...stylex.props(styles.bubble, styles.userBubble)}>
        <ThreadMessageContent content={submission.content} />
      </article>
      <time
        dateTime={new Date(submission.submittedAt).toISOString()}
        {...stylex.props(styles.timestamp)}
      >
        {formatTimestamp(submission.submittedAt)}
      </time>
      <div {...stylex.props(styles.replyState)}>
        <p role="status" {...stylex.props(styles.replyStatus)}>
          Sending…
        </p>
      </div>
    </>
  );
});

const styles = stylex.create({
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
});
