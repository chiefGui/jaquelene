import { Button } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { ThreadMessageDeleteConfirmation } from "./thread-message-delete-confirmation";

export type ThreadMessageEditSession = Readonly<{
  messageId: string;
  originalContent: string;
}>;

export type ThreadMessageEditorProps = Readonly<{
  session: ThreadMessageEditSession;
  maxLength: number;
  pending: boolean;
  onCancel: () => void;
  onDelete: (() => Promise<void>) | null;
  onReady: () => void;
  onSave: (content: string) => Promise<void>;
}>;

function EditorError({ error, id }: Readonly<{ error: string | null; id: string }>) {
  if (!error) {
    return null;
  }

  return (
    <p id={id} role="alert" {...stylex.props(styles.error)}>
      {error}
    </p>
  );
}

function saveLabel(pending: boolean) {
  if (pending) {
    return "Saving...";
  }

  return "Save";
}

export default function ThreadMessageEditor({
  session,
  maxLength,
  pending,
  onCancel,
  onDelete,
  onReady,
  onSave,
}: ThreadMessageEditorProps) {
  const [draft, setDraft] = useState(session.originalContent);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const saveRequestPending = useRef(false);
  const errorId = useId();
  const empty = !draft.trim();
  let saveDisabled = pending || draft === session.originalContent;
  const errorDescription: { "aria-describedby"?: string } = {};

  if (empty && !onDelete) {
    saveDisabled = true;
  }

  if (error) {
    errorDescription["aria-describedby"] = errorId;
  }

  useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  function changeDraft(value: string) {
    setDraft(value);
    setError(null);
  }

  async function saveDraft() {
    if (saveRequestPending.current) {
      return;
    }

    saveRequestPending.current = true;

    try {
      await onSave(draft);
    } catch {
      setError("Could not save this message.");
    } finally {
      saveRequestPending.current = false;
    }
  }

  function submitEdit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saveDisabled || empty) {
      return;
    }

    void saveDraft();
  }

  let primaryAction = (
    <Button
      type="submit"
      shape="squircle"
      size="small"
      disabled={saveDisabled}
      aria-busy={pending || undefined}
    >
      {saveLabel(pending)}
    </Button>
  );

  if (empty && onDelete) {
    primaryAction = (
      <ThreadMessageDeleteConfirmation
        open={deleteConfirmationOpen}
        pending={pending}
        setOpen={setDeleteConfirmationOpen}
        onDelete={onDelete}
        trigger={
          <Button type="button" shape="squircle" size="small" disabled={saveDisabled}>
            Save
          </Button>
        }
      />
    );
  }

  return (
    <form aria-busy={pending || undefined} onSubmit={submitEdit} {...stylex.props(styles.form)}>
      <MarkdownEditor.Root
        aria-label="Edit message"
        {...errorDescription}
        aria-invalid={error !== null}
        autoFocus
        initialSelection="end"
        value={draft}
        onValueChange={changeDraft}
        maxLength={maxLength}
        readOnly={pending}
      >
        <MarkdownEditor.Frame>
          <MarkdownEditor.Toolbar>
            <MarkdownEditor.FormattingActions />
            <MarkdownEditor.PreviewToggle style={styles.previewToggle} />
          </MarkdownEditor.Toolbar>
          <MarkdownEditor.Content />
          <div {...stylex.props(styles.footer)}>
            <EditorError id={errorId} error={error} />
            <div role="group" aria-label="Message edit actions" {...stylex.props(styles.actions)}>
              <Button
                type="button"
                shape="squircle"
                size="small"
                variant="ghost"
                disabled={pending}
                onClick={onCancel}
              >
                Cancel
              </Button>
              {primaryAction}
            </div>
          </div>
        </MarkdownEditor.Frame>
      </MarkdownEditor.Root>
    </form>
  );
}

const styles = stylex.create({
  form: {
    maxWidth: "82%",
    width: "100%",
  },
  previewToggle: {
    marginLeft: "auto",
  },
  footer: {
    alignItems: "center",
    borderTopColor: colors.borderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.75rem",
    justifyContent: "flex-end",
    minHeight: tokens.controlHeight,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
  },
  error: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginRight: "auto",
  },
});
