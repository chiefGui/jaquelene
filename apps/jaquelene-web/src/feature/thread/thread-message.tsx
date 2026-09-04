import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GenerationFailureKind,
  ThreadMessageAuthor,
  type ThreadMessage,
} from "@jaquelene/ipc/renderer";
import { Button, IconButton, Skeleton, Timestamp } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { lazy, memo, Suspense, useState, type ReactNode } from "react";
import { EditIcon, RegenerateIcon } from "@/primitive/icons";
import { Markdown } from "../markdown/markdown";
import type { SubmitTurnVariables } from "./query";
import { ThreadMessageDeleteConfirmation } from "./thread-message-delete-confirmation";
import type { ThreadMessageEditorProps } from "./thread-message-editor";
import type { ThreadViewState } from "./thread-view-state";

const loadThreadMessageEditor = () => import("./thread-message-editor");
const ThreadMessageEditor = lazy(loadThreadMessageEditor);
const messageFooterGap = "0.375rem";

type ThreadReplyFailureView = ThreadViewState["messages"][number]["replyFailure"];
type ThreadReplyRegenerationView = ThreadViewState["messages"][number]["regeneration"];
type FailedTurnGeneration = NonNullable<ThreadReplyFailureView>["generation"];

function replyFailureText(generation: FailedTurnGeneration, retrying: boolean) {
  if (retrying) {
    return "Retrying…";
  }

  if (generation.failureKind === GenerationFailureKind.Interrupted) {
    return "Reply interrupted.";
  }

  return "Couldn't generate a reply.";
}

function MessageRoot({
  children,
  fromUser,
  reserveFooterSpace = false,
}: Readonly<{
  children: ReactNode;
  fromUser: boolean;
  reserveFooterSpace?: boolean;
}>) {
  return (
    <article
      aria-label={fromUser ? "You" : "Assistant"}
      data-reserve-footer-space={reserveFooterSpace || undefined}
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

function MessageFooter({ children }: Readonly<{ children: ReactNode }>) {
  return <footer {...stylex.props(styles.messageFooter)}>{children}</footer>;
}

function MessageToolbar({
  active = false,
  children,
  createdAt,
  editDisabled = false,
  onEdit,
}: Readonly<{
  active?: boolean;
  children?: ReactNode;
  createdAt: number;
  editDisabled?: boolean;
  onEdit?: () => void;
}>) {
  let actionGroup: ReactNode = null;

  if (onEdit || children) {
    actionGroup = (
      <div role="group" aria-label="Message actions" {...stylex.props(styles.toolbarActions)}>
        <MessageEditAction disabled={editDisabled} onEdit={onEdit} />
        {children}
      </div>
    );
  }

  return (
    <div data-active={active || undefined} {...stylex.props(styles.toolbar)}>
      <Timestamp value={createdAt} style={styles.toolbarTimestamp} />
      {actionGroup}
    </div>
  );
}

function MessageEditAction({
  disabled,
  onEdit,
}: Readonly<{ disabled: boolean; onEdit: (() => void) | undefined }>) {
  if (!onEdit) {
    return null;
  }

  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        render={
          <IconButton.Root
            type="button"
            size="small"
            aria-label="Edit message"
            disabled={disabled}
            onFocus={() => void loadThreadMessageEditor()}
            onPointerEnter={() => void loadThreadMessageEditor()}
            onClick={onEdit}
          >
            <IconButton.Icon render={<HugeiconsIcon icon={EditIcon} />} />
          </IconButton.Root>
        }
      />
      <Tooltip>Edit</Tooltip>
    </Tooltip.Root>
  );
}

function UserMessageToolbar({
  createdAt,
  disabled,
  deletePending,
  deleteFromUserMessage,
  onEdit,
  userMessageId,
}: Readonly<{
  createdAt: number;
  disabled: boolean;
  deletePending: boolean;
  deleteFromUserMessage: (userMessageId: string) => Promise<void>;
  onEdit: () => void;
  userMessageId: string;
}>) {
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  return (
    <MessageToolbar
      active={deleteConfirmationOpen}
      createdAt={createdAt}
      editDisabled={disabled || deletePending}
      onEdit={onEdit}
    >
      <Tooltip.Root>
        <ThreadMessageDeleteConfirmation
          open={deleteConfirmationOpen}
          pending={deletePending}
          setOpen={setDeleteConfirmationOpen}
          onDelete={() => deleteFromUserMessage(userMessageId)}
          trigger={
            <Tooltip.Anchor
              render={
                <IconButton.Root
                  type="button"
                  size="small"
                  aria-label="Delete this and subsequent messages"
                  disabled={disabled || deletePending}
                >
                  <IconButton.Icon render={<HugeiconsIcon icon={TrashIcon} />} />
                </IconButton.Root>
              }
            />
          }
        />

        <Tooltip>Delete from here</Tooltip>
      </Tooltip.Root>
    </MessageToolbar>
  );
}

function AssistantMessageToolbar({
  actionsDisabled,
  createdAt,
  editDisabled,
  messageId,
  onEdit,
  regeneration,
  requestPending,
  regenerateResponse,
}: Readonly<{
  actionsDisabled: boolean;
  createdAt: number;
  editDisabled: boolean;
  messageId: string;
  onEdit: () => void;
  regeneration: ThreadReplyRegenerationView;
  requestPending: boolean;
  regenerateResponse: (assistantMessageId: string) => Promise<boolean>;
}>) {
  const [open, setOpen] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);

  if (!regeneration) {
    return <MessageToolbar createdAt={createdAt} editDisabled={editDisabled} onEdit={onEdit} />;
  }

  function setConfirmationOpen(nextOpen: boolean) {
    if (nextOpen) {
      setRequestFailed(false);
    }

    if (!requestPending) {
      setOpen(nextOpen);
    }
  }

  async function regenerate() {
    setRequestFailed(false);

    if (await regenerateResponse(messageId)) {
      setOpen(false);
    } else {
      setRequestFailed(true);
    }
  }

  const disabled =
    actionsDisabled ||
    requestPending ||
    regeneration.status === "pending" ||
    !regeneration.canRegenerate;

  return (
    <MessageToolbar
      active={open || regeneration.status !== "available"}
      createdAt={createdAt}
      editDisabled={editDisabled || requestPending}
      onEdit={onEdit}
    >
      <Tooltip.Root>
        <ConfirmDialog
          open={open}
          setOpen={setConfirmationOpen}
          trigger={
            <Tooltip.Anchor
              render={
                <IconButton.Root
                  type="button"
                  size="small"
                  aria-label="Regenerate response"
                  disabled={disabled}
                >
                  <IconButton.Icon render={<HugeiconsIcon icon={RegenerateIcon} />} />
                </IconButton.Root>
              }
            />
          }
          heading="Regenerate response?"
          description="This creates another response using the current settings and may incur provider usage."
          confirmLabel="Regenerate"
          pending={requestPending}
          error={requestFailed ? "Couldn't start regeneration." : undefined}
          onConfirm={() => void regenerate()}
        />

        <Tooltip>Regenerate response</Tooltip>
      </Tooltip.Root>
    </MessageToolbar>
  );
}

function MessageEditorFallback() {
  return (
    <div role="status" aria-label="Loading message editor" {...stylex.props(styles.editorFallback)}>
      <div {...stylex.props(styles.editorFallbackToolbar)}>
        <Skeleton style={styles.editorFallbackFormattingActions} />
        <Skeleton style={styles.editorFallbackPreviewAction} />
      </div>
      <div {...stylex.props(styles.editorFallbackContent)}>
        <Skeleton style={styles.editorFallbackLine} />
        <Skeleton style={[styles.editorFallbackLine, styles.editorFallbackLineMedium]} />
        <Skeleton style={[styles.editorFallbackLine, styles.editorFallbackLineShort]} />
      </div>
      <div {...stylex.props(styles.editorFallbackFooter)}>
        <Skeleton style={styles.editorFallbackSubmitActions} />
      </div>
    </div>
  );
}

function MessageContent({
  editor,
  message,
}: Readonly<{
  editor: ThreadMessageEditorProps | null;
  message: ThreadMessage;
}>) {
  if (editor) {
    return (
      <Suspense fallback={<MessageEditorFallback />}>
        <ThreadMessageEditor {...editor} />
      </Suspense>
    );
  }

  return (
    <div {...stylex.props(styles.bubble)}>
      <Markdown content={message.content} />
    </div>
  );
}

function renderRegenerationState(regeneration: ThreadReplyRegenerationView) {
  if (regeneration?.status === "pending") {
    return (
      <div {...stylex.props(styles.replyState, styles.assistantReplyState)}>
        <p role="status" {...stylex.props(styles.replyStatus)}>
          Regenerating…
        </p>
      </div>
    );
  }

  if (regeneration?.status === "failed") {
    return (
      <div {...stylex.props(styles.replyState, styles.assistantReplyState)}>
        <p role="alert" {...stylex.props(styles.replyStatus, styles.replyFailure)}>
          Couldn't regenerate the response.
        </p>
      </div>
    );
  }

  return null;
}

function renderReplyFailureState({
  announce,
  failure,
  retryPending,
  retryReply,
  turnId,
}: Readonly<{
  announce: boolean;
  failure: ThreadReplyFailureView;
  retryPending: boolean;
  retryReply: (turnId: string) => Promise<void>;
  turnId: string;
}>) {
  if (!failure) {
    return null;
  }

  let liveRegionRole: "status" | undefined;
  let retryAction: ReactNode = null;
  let retryError: ReactNode = null;

  if (announce) {
    liveRegionRole = "status";
  }

  if (failure.canRetry && !failure.retrying) {
    retryAction = (
      <Button
        type="button"
        variant="ghost"
        style={styles.retryButton}
        disabled={retryPending}
        onClick={() => void retryReply(turnId)}
      >
        Retry
      </Button>
    );
  }

  if (failure.retryFailed) {
    retryError = (
      <p role="alert" {...stylex.props(styles.retryError)}>
        Couldn't retry the reply.
      </p>
    );
  }

  return (
    <div {...stylex.props(styles.replyState)}>
      <p role={liveRegionRole} {...stylex.props(styles.replyStatus, styles.replyFailure)}>
        {replyFailureText(failure.generation, failure.retrying)}
      </p>
      {retryAction}
      {retryError}
    </div>
  );
}

export const ThreadMessageRow = memo(function ThreadMessageRow({
  message,
  regeneration,
  replyFailure,
  announceReplyFailure,
  actionsDisabled,
  regenerationRequestPending,
  responseActionsDisabled,
  regenerateResponse,
  retryPending,
  retryReply,
  editor,
  beginEdit,
  deletePending,
  deleteFromUserMessage,
  hasFollowingItem,
}: Readonly<{
  message: ThreadMessage;
  regeneration: ThreadReplyRegenerationView;
  replyFailure: ThreadReplyFailureView;
  announceReplyFailure: boolean;
  actionsDisabled: boolean;
  regenerationRequestPending: boolean;
  responseActionsDisabled: boolean;
  regenerateResponse: (assistantMessageId: string) => Promise<boolean>;
  retryPending: boolean;
  retryReply: (turnId: string) => Promise<void>;
  editor: ThreadMessageEditorProps | null;
  beginEdit: (message: ThreadMessage) => void;
  deletePending: boolean;
  deleteFromUserMessage: (userMessageId: string) => Promise<void>;
  hasFollowingItem: boolean;
}>) {
  const fromUser = message.author === ThreadMessageAuthor.User;
  let toolbar: ReactNode = null;

  if (!editor) {
    if (fromUser) {
      toolbar = (
        <UserMessageToolbar
          createdAt={message.createdAt}
          disabled={actionsDisabled}
          deletePending={deletePending}
          deleteFromUserMessage={deleteFromUserMessage}
          onEdit={() => beginEdit(message)}
          userMessageId={message.id}
        />
      );
    } else {
      toolbar = (
        <AssistantMessageToolbar
          actionsDisabled={responseActionsDisabled}
          createdAt={message.createdAt}
          editDisabled={actionsDisabled}
          messageId={message.id}
          onEdit={() => beginEdit(message)}
          regeneration={regeneration}
          requestPending={regenerationRequestPending}
          regenerateResponse={regenerateResponse}
        />
      );
    }
  }

  const regenerationState = renderRegenerationState(regeneration);
  const replyFailureState = renderReplyFailureState({
    announce: announceReplyFailure,
    failure: replyFailure,
    retryPending,
    retryReply,
    turnId: message.turnId,
  });
  const hasFooterContent =
    toolbar !== null || regenerationState !== null || replyFailureState !== null;
  const reserveFooterSpace = editor !== null && hasFollowingItem && !hasFooterContent;
  let footer: ReactNode = null;

  if (hasFooterContent) {
    footer = (
      <MessageFooter>
        {toolbar}
        {regenerationState}
        {replyFailureState}
      </MessageFooter>
    );
  }

  return (
    <MessageRoot fromUser={fromUser} reserveFooterSpace={reserveFooterSpace}>
      <MessageContent message={message} editor={editor} />
      {footer}
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
      <div {...stylex.props(styles.bubble)}>
        <Markdown content={submission.content} />
      </div>
      <MessageFooter>
        <MessageToolbar createdAt={submission.submittedAt} />
        <div {...stylex.props(styles.replyState)}>
          <p role="status" {...stylex.props(styles.replyStatus)}>
            Sending…
          </p>
        </div>
      </MessageFooter>
    </MessageRoot>
  );
});

const styles = stylex.create({
  message: {
    paddingBlockEnd: {
      default: 0,
      ':is([data-reserve-footer-space="true"])': `calc(${tokens.controlHeightSmall} + ${messageFooterGap})`,
    },
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
  messageFooter: {
    display: "flex",
    flexDirection: "column",
    marginTop: messageFooterGap,
    minHeight: tokens.controlHeightSmall,
  },
  bubble: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: colors.borderSubtle,
    borderRadius: radii.content,
    borderStyle: "solid",
    borderWidth: 1,
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    maxWidth: "82%",
    minWidth: 0,
    overflowWrap: "anywhere",
    paddingBlock: "0.625rem",
    paddingInline: "0.75rem",
  },
  toolbar: {
    alignItems: "center",
    color: colors.foregroundSecondary,
    display: "flex",
    gap: "0.75rem",
    minHeight: tokens.controlHeightSmall,
    opacity: {
      default: 0,
      "@media (hover: none)": 1,
      ':is([data-active="true"])': 1,
      [stylex.when.ancestor(":focus-within")]: 1,
      [stylex.when.ancestor(":hover")]: 1,
    },
  },
  toolbarTimestamp: {
    color: "inherit",
    fontSize: tokens.fontSizeXXSmall,
    lineHeight: tokens.lineHeightXXSmall,
  },
  toolbarActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.125rem",
  },
  replyState: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    marginTop: "0.375rem",
  },
  assistantReplyState: {
    alignItems: "flex-start",
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
  editorFallback: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: colors.borderSubtle,
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    maxWidth: "82%",
    minHeight: "12rem",
    overflow: "hidden",
    width: "100%",
  },
  editorFallbackToolbar: {
    alignItems: "center",
    borderBottomColor: colors.borderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
    padding: "0.25rem",
  },
  editorFallbackFormattingActions: {
    height: tokens.controlHeightSmall,
    width: "3.125rem",
  },
  editorFallbackPreviewAction: {
    height: tokens.controlHeightSmall,
    marginLeft: "auto",
    width: tokens.controlHeightSmall,
  },
  editorFallbackContent: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "0.625rem",
    padding: "1rem",
  },
  editorFallbackLine: {
    height: "0.625rem",
    width: "86%",
  },
  editorFallbackLineMedium: {
    width: "72%",
  },
  editorFallbackLineShort: {
    width: "54%",
  },
  editorFallbackFooter: {
    alignItems: "center",
    borderTopColor: colors.borderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexShrink: 0,
    justifyContent: "flex-end",
    minHeight: tokens.controlHeight,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
  },
  editorFallbackSubmitActions: {
    height: tokens.controlHeightSmall,
    width: "5.5rem",
  },
});
