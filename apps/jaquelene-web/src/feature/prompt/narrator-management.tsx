import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Prompt } from "@jaquelene/ipc/renderer";
import { IconButton, Item, Switch } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { promptDefaultQuery, useDeletePrompt, useSetPromptDefault } from "./query";

type NarratorPromptManagementProps = {
  onDeleted: () => Promise<void>;
  prompt: Prompt;
};

export function NarratorPromptManagement({ onDeleted, prompt }: NarratorPromptManagementProps) {
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(prompt.kind));
  const setDefault = useSetPromptDefault(prompt.kind);
  const deletePrompt = useDeletePrompt();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const defaultLabelId = useId();
  const defaultDescriptionId = useId();
  const defaultErrorId = useId();
  const isDefault = defaultSelection.promptKey === prompt.key;

  function changeDefault(checked: boolean) {
    setDefault.reset();
    setDefault.mutate(checked ? prompt.key : undefined, {
      onError(cause) {
        reportError("prompt.default.update", cause);
      },
    });
  }

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

    try {
      await onDeleted();
    } catch (cause) {
      reportError("prompt.open-list", cause);
    }
  }

  return (
    <Item.Group aria-label="Narrator prompt management">
      <Item.Root>
        <Item.Content>
          <Item.Label id={defaultLabelId} render={<label htmlFor={`${defaultLabelId}-control`} />}>
            Default narrator
          </Item.Label>
          <Item.Description id={defaultDescriptionId}>
            The narrator selected by default for new campaigns.
          </Item.Description>
          {setDefault.isError ? (
            <Item.Description id={defaultErrorId} role="alert" style={styles.error}>
              Couldn't update the default narrator
            </Item.Description>
          ) : null}
        </Item.Content>

        <Item.Value>
          <Switch
            id={`${defaultLabelId}-control`}
            aria-labelledby={defaultLabelId}
            aria-describedby={
              setDefault.isError
                ? `${defaultDescriptionId} ${defaultErrorId}`
                : defaultDescriptionId
            }
            aria-busy={setDefault.isPending || undefined}
            checked={isDefault}
            disabled={setDefault.isPending || deletePrompt.isPending}
            onCheckedChange={changeDefault}
          />
        </Item.Value>
      </Item.Root>

      <Item.Root>
        <Item.Content>
          <Item.Label>Delete</Item.Label>
          <Item.Description>Permanently remove this narrator prompt.</Item.Description>
        </Item.Content>

        <Tooltip.Root>
          <ConfirmDialog
            open={confirmingDelete}
            setOpen={setDeleteConfirmationOpen}
            trigger={
              <Tooltip.Anchor
                render={
                  <IconButton
                    aria-label={`Delete ${prompt.title}`}
                    disabled={deletePrompt.isPending}
                  >
                    <HugeiconsIcon
                      icon={TrashIcon}
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
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
      </Item.Root>
    </Item.Group>
  );
}

const styles = stylex.create({
  error: { color: colors.foregroundDanger },
});
