import { Button } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, type SubmitEvent } from "react";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";

export type ThreadMessageEditSession = Readonly<{
  messageId: string;
  threadId: string;
  originalContent: string;
  draft: string;
  error: string | null;
}>;

export type ThreadMessageEditorProps = Readonly<{
  session: ThreadMessageEditSession;
  maxLength: number;
  pending: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onReady: () => void;
  onSave: () => Promise<void>;
}>;

function EditorError({ error }: Readonly<{ error: string | null }>) {
  if (!error) {
    return null;
  }

  return (
    <p role="alert" {...stylex.props(styles.error)}>
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
  onDraftChange,
  onReady,
  onSave,
}: ThreadMessageEditorProps) {
  const saveDisabled =
    pending || !session.draft.trim() || session.draft === session.originalContent;

  useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  function submitEdit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saveDisabled) {
      return;
    }

    void onSave();
  }

  return (
    <form aria-busy={pending || undefined} onSubmit={submitEdit} {...stylex.props(styles.form)}>
      <MarkdownEditor.Root
        aria-label="Edit message"
        autoFocus
        initialSelection="end"
        value={session.draft}
        onValueChange={onDraftChange}
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
            <EditorError error={session.error} />
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
              <Button
                type="submit"
                shape="squircle"
                size="small"
                disabled={saveDisabled}
                aria-busy={pending || undefined}
              >
                {saveLabel(pending)}
              </Button>
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
