import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { narratorSkillKindKey } from "@jaquelene/domain";
import type { CustomSkill } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Tooltip } from "@jaquelene/ui/tooltip";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useDeleteSkill } from "@/feature/skill/query";

type NarratorSkillDeleteActionProps = {
  isDefault: boolean;
  onDeleted?: () => Promise<void>;
  skill: CustomSkill;
  style?: StyleXStyles;
};

export function NarratorSkillDeleteAction({
  isDefault,
  onDeleted,
  skill,
  style,
}: NarratorSkillDeleteActionProps) {
  const deleteSkill = useDeleteSkill(narratorSkillKindKey);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function setDeleteConfirmationOpen(open: boolean) {
    if (open) {
      deleteSkill.reset();
    }

    if (!deleteSkill.isPending) {
      setConfirmingDelete(open);
    }
  }

  async function remove() {
    try {
      await deleteSkill.mutateAsync(skill.key);
    } catch (cause) {
      reportError("skill.delete", cause);
      return;
    }

    if (!onDeleted) {
      return;
    }

    try {
      await onDeleted();
    } catch (cause) {
      reportError("skill.open-list", cause);
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
              <IconButton.Root
                aria-label={`Delete ${skill.title}`}
                disabled={deleteSkill.isPending}
                style={style}
              >
                <IconButton.Icon render={<HugeiconsIcon icon={TrashIcon} />} />
              </IconButton.Root>
            }
          />
        }
        heading={`Delete "${skill.title}"?`}
        description={
          isDefault
            ? "The built-in narrator will replace it as the default. This can't be undone."
            : "Campaigns using this narrator will use the default instead. This can't be undone."
        }
        confirmLabel="Delete"
        pending={deleteSkill.isPending}
        error={deleteSkill.isError ? "Couldn't delete this prompt." : undefined}
        onConfirm={() => void remove()}
      />

      <Tooltip>Delete</Tooltip>
    </Tooltip.Root>
  );
}
