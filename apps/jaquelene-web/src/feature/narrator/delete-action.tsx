import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Prompt } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Tooltip } from "@jaquelene/ui/tooltip";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import type { useDeletePrompt } from "@/feature/prompt/query";

type NarratorPromptDeleteActionProps = {
  deletePrompt: ReturnType<typeof useDeletePrompt>;
  disabled?: boolean;
  isDefault: boolean;
  onDeleted?: () => Promise<void>;
  prompt: Prompt;
  style?: StyleXStyles;
};

export function NarratorPromptDeleteAction({
  deletePrompt,
  disabled = false,
  isDefault,
  onDeleted,
  prompt,
  style,
}: NarratorPromptDeleteActionProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function setDeleteConfirmationOpen(open: boolean) {
    if (open) {
      deletePrompt.reset();
    }

    if (!deletePrompt.isPending) {
      setConfirmingDelete(open);
    }
  }

  async function remove() {
    try {
      await deletePrompt.mutateAsync(prompt.key);
    } catch (cause) {
      reportError("prompt.delete", cause);
      return;
    }

    if (!onDeleted) {
      return;
    }

    try {
      await onDeleted();
    } catch (cause) {
      reportError("prompt.open-list", cause);
    }
  }

  return (
    <Tooltip.Root>
      <ConfirmDialog
        open={confirmingDelete}
        setOpen={setDeleteConfirmationOpen}
        trigger={
          <Tooltip.Anchor
            render={
              <IconButton
                aria-label={`Delete ${prompt.title}`}
                disabled={disabled || deletePrompt.isPending}
                style={style}
              >
                <HugeiconsIcon icon={TrashIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
            }
          />
        }
        heading={`Delete "${prompt.title}"?`}
        description={
          isDefault
            ? "The built-in narrator will replace it as the default. This can't be undone."
            : "Campaigns using this narrator will use the default instead. This can't be undone."
        }
        confirmLabel="Delete"
        pending={deletePrompt.isPending}
        error={deletePrompt.isError ? "Couldn't delete this prompt." : undefined}
        onConfirm={() => void remove()}
      />

      <Tooltip>Delete</Tooltip>
    </Tooltip.Root>
  );
}
