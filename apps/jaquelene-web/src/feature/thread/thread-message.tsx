import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { GenerationFailureKind, type ThreadMessage } from "@jaquelene/ipc/renderer";
import { Button, IconButton, formatTimestamp } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { memo, useState, type ReactNode } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { Markdown } from "../markdown/markdown";
import { useDeleteThreadHistoryFromMessage, type SubmitTurnVariables } from "./query";
import type { ThreadViewState } from "./thread-view-state";

type ThreadReplyFailureView = ThreadViewState["messages"][number]["replyFailure"];
type FailedTurnGeneration = NonNullable<ThreadReplyFailureView>["generation"];

function replyFailureText(generation: FailedTurnGeneration, retrying: boolean) {
  if (retrying) {
    return "Retrying…";
  }

  return generation.failureKind === GenerationFailureKind.Interrupted
    ? "Reply interrupted."
    : "Couldn’t generate a reply.";
}

function MessageRoot({ children, fromUser }: Readonly<{ children: ReactNode; fromUser: boolean }>) {
  return (
    <article
      aria-label={fromUser ? "You" : "Assistant"}
      {...stylex.props(
        styles.message,
        fromUser ? styles.userMessage : styles.assistantMessage,
        stylex.defaultMarker(),
      )}
    >
      {children}
    </article>
  );
}

function MessageToolbar({
  active = false,
  children,
  createdAt,
}: Readonly<{ active?: boolean; children?: ReactNode; createdAt: number }>) {
  return (
    <div data-active={active || undefined} {...stylex.props(styles.toolbar)}>
      <time dateTime={new Date(createdAt).toISOString()} {...stylex.props(styles.timestamp)}>
        {formatTimestamp(createdAt)}
      </time>
      {children}
    </div>
  );
}

function UserMessageToolbar({
  createdAt,
  disabled,
  threadId,
  userMessageId,
}: Readonly<{
  createdAt: number;
  disabled: boolean;
  threadId: string;
  userMessageId: string;
}>) {
  const deleteHistory = useDeleteThreadHistoryFromMessage(threadId);
  const [open, setOpen] = useState(false);

  function setConfirmationOpen(nextOpen: boolean) {
    if (nextOpen) {
      deleteHistory.reset();
    }

    if (!deleteHistory.isPending) {
      setOpen(nextOpen);
    }
  }

  async function deleteFromMessage() {
    try {
      await deleteHistory.mutateAsync(userMessageId);
      setOpen(false);
    } catch (cause) {
      reportError("thread.history.delete", cause);
    }
  }

  return (
    <MessageToolbar active={open} createdAt={createdAt}>
      <Tooltip.Root>
        <ConfirmDialog
          open={open}
          setOpen={setConfirmationOpen}
          trigger={
            <Tooltip.Anchor
              render={
                <IconButton
                  type="button"
                  size="small"
                  aria-label="Delete this and subsequent messages"
                  disabled={disabled || deleteHistory.isPending}
                >
                  <HugeiconsIcon icon={TrashIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
                </IconButton>
              }
            />
          }
          heading="Delete from here?"
          description="This message and everything after it will be deleted."
          confirmLabel="Delete"
          pending={deleteHistory.isPending}
          error={deleteHistory.isError ? "Couldn’t delete these messages." : undefined}
          onConfirm={() => void deleteFromMessage()}
        />

        <Tooltip>Delete from here</Tooltip>
      </Tooltip.Root>
    </MessageToolbar>
  );
}

export const ThreadMessageRow = memo(function ThreadMessageRow({
  message,
  fromUser,
  replyFailure,
  announceReplyFailure,
  actionsDisabled,
  retryPending,
  retryReply,
}: Readonly<{
  message: ThreadMessage;
  fromUser: boolean;
  replyFailure: ThreadReplyFailureView;
  announceReplyFailure: boolean;
  actionsDisabled: boolean;
  retryPending: boolean;
  retryReply: (turnId: string) => Promise<void>;
}>) {
  return (
    <MessageRoot fromUser={fromUser}>
      <div {...stylex.props(styles.bubble, fromUser ? styles.userBubble : styles.assistantBubble)}>
        <Markdown content={message.content} />
      </div>
      {fromUser ? (
        <UserMessageToolbar
          createdAt={message.createdAt}
          disabled={actionsDisabled}
          threadId={message.threadId}
          userMessageId={message.id}
        />
      ) : (
        <MessageToolbar createdAt={message.createdAt} />
      )}
      {replyFailure ? (
        <div {...stylex.props(styles.replyState)}>
          <p
            role={announceReplyFailure ? "status" : undefined}
            {...stylex.props(styles.replyStatus, styles.replyFailure)}
          >
            {replyFailureText(replyFailure.generation, replyFailure.retrying)}
          </p>
          {replyFailure.canRetry && !replyFailure.retrying ? (
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
          {replyFailure.retryFailed ? (
            <p role="alert" {...stylex.props(styles.retryError)}>
              Couldn’t retry the reply.
            </p>
          ) : null}
        </div>
      ) : null}
    </MessageRoot>
  );
});

export const PendingThreadMessageRow = memo(function PendingThreadMessageRow({
  submission,
}: Readonly<{
  submission: SubmitTurnVariables;
}>) {
  return (
    <MessageRoot fromUser>
      <div {...stylex.props(styles.bubble, styles.userBubble)}>
        <Markdown content={submission.content} />
      </div>
      <MessageToolbar createdAt={submission.submittedAt} />
      <div {...stylex.props(styles.replyState)}>
        <p role="status" {...stylex.props(styles.replyStatus)}>
          Sending…
        </p>
      </div>
    </MessageRoot>
  );
});

const styles = stylex.create({
  message: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  userMessage: {
    alignItems: "flex-end",
  },
  assistantMessage: {
    alignItems: "flex-start",
  },
  bubble: {
    borderRadius: radii.content,
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    maxWidth: "82%",
    minWidth: 0,
    overflowWrap: "anywhere",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
  },
  userBubble: {
    backgroundColor: colors.backgroundSelected,
  },
  assistantBubble: {
    backgroundColor: colors.backgroundSurfaceRaised,
    borderColor: colors.borderDefault,
    borderStyle: "solid",
    borderWidth: 1,
  },
  toolbar: {
    alignItems: "center",
    color: colors.foregroundSecondary,
    display: "flex",
    gap: "0.375rem",
    marginTop: "0.375rem",
    minHeight: tokens.controlHeightSmall,
    opacity: {
      default: 0,
      "@media (hover: none)": 1,
      ':is([data-active="true"])': 1,
      [stylex.when.ancestor(":focus-within")]: 1,
      [stylex.when.ancestor(":hover")]: 1,
    },
  },
  timestamp: {
    color: "inherit",
    fontSize: tokens.fontSizeXXSmall,
    lineHeight: tokens.lineHeightXXSmall,
  },
  replyState: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    marginTop: "0.375rem",
  },
  replyStatus: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  replyFailure: {
    color: colors.foregroundDanger,
  },
  retryButton: {
    height: "2rem",
    paddingInline: "0.5rem",
  },
  retryError: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
