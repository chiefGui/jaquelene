import type { Prompt } from "@jaquelene/ipc/renderer";
import { Button, Item, Switch } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { promptDefaultQuery, useDeletePrompt, useSetPromptDefault } from "@/feature/prompt/query";

type PromptManagementProps = {
  onDeleted: () => Promise<void>;
  prompt: Prompt;
};

export function PromptManagement({ onDeleted, prompt }: PromptManagementProps) {
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(prompt.kind));
  const setDefault = useSetPromptDefault(prompt.kind);
  const deletePrompt = useDeletePrompt();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const defaultLabelId = useId();
  const defaultDescriptionId = useId();
  const defaultErrorId = useId();
  const isDefault = defaultSelection.promptKey === prompt.key;
  const mutationPending = setDefault.isPending || deletePrompt.isPending;

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
    <Item.Group aria-label="Prompt management">
      <Item.Root>
        <Item.Content>
          <Item.Label id={defaultLabelId} render={<label htmlFor={`${defaultLabelId}-control`} />}>
            Set as default
          </Item.Label>
          <Item.Description id={defaultDescriptionId}>
            Use this narrator when a campaign doesn’t choose one.
          </Item.Description>
          {setDefault.isError ? (
            <Item.Description id={defaultErrorId} role="alert" style={styles.error}>
              Couldn’t update the default narrator
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
            disabled={mutationPending}
            onCheckedChange={changeDefault}
          />
        </Item.Value>
      </Item.Root>

      <Item.Root>
        <Item.Content>
          <Item.Label>Delete</Item.Label>
          <Item.Description>Permanently remove this narrator prompt.</Item.Description>
        </Item.Content>

        <ConfirmDialog
          open={confirmingDelete}
          setOpen={setDeleteConfirmationOpen}
          trigger={
            <Button type="button" variant="ghost" tone="danger" disabled={mutationPending}>
              Delete
            </Button>
          }
          heading={`Delete “${prompt.title}”?`}
          description={
            isDefault
              ? "The built-in narrator will become the default, and campaigns using this prompt will return to it. This can’t be undone."
              : "Campaigns using this prompt will return to their default. This can’t be undone."
          }
          confirmLabel="Delete"
          pending={deletePrompt.isPending}
          error={deletePrompt.isError ? "Couldn’t delete this prompt." : undefined}
          onConfirm={() => void remove()}
        />
      </Item.Root>
    </Item.Group>
  );
}

const styles = stylex.create({
  error: { color: colors.foregroundDanger },
});
