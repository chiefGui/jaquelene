import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CustomPrompt } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Tooltip } from "@jaquelene/ui/tooltip";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useDeletePrompt } from "./query";

export type PromptDeleteActionProps = {
  description: string;
  onDeleted?: () => Promise<void>;
  prompt: CustomPrompt;
  style?: StyleXStyles;
};

export function PromptDeleteAction({
  description,
  onDeleted,
  prompt,
  style,
}: PromptDeleteActionProps) {
  const deletePrompt = useDeletePrompt(prompt.kind);
  const [open, setOpen] = useState(false);
  let error: string | undefined;
  if (deletePrompt.isError) {
    error = "Couldn't delete this prompt.";
  }

  function changeOpen(nextOpen: boolean) {
    if (deletePrompt.isPending) {
      return;
    }
    if (nextOpen) {
      deletePrompt.reset();
    }
    setOpen(nextOpen);
  }

  async function remove() {
    try {
      await deletePrompt.mutateAsync(prompt.key);
    } catch (cause) {
      reportError("prompt.delete", cause);
      return;
    }
    setOpen(false);
    if (onDeleted) {
      try {
        await onDeleted();
      } catch (cause) {
        reportError("prompt.open-list", cause);
      }
    }
  }

  return (
    <Tooltip.Root>
      <ConfirmDialog
        open={open}
        setOpen={changeOpen}
        trigger={
          <Tooltip.Anchor
            render={
              <IconButton.Root
                aria-label={`Delete ${prompt.title}`}
                disabled={deletePrompt.isPending}
                style={style}
              >
                <IconButton.Icon render={<HugeiconsIcon icon={TrashIcon} />} />
              </IconButton.Root>
            }
          />
        }
        heading={`Delete "${prompt.title}"?`}
        description={description}
        confirmLabel="Delete"
        pending={deletePrompt.isPending}
        error={error}
        onConfirm={() => void remove()}
      />
      <Tooltip>Delete</Tooltip>
    </Tooltip.Root>
  );
}
