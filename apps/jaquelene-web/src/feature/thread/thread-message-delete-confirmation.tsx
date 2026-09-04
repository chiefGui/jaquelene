import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { useRef, useState, type ReactElement } from "react";

type ThreadMessageDeleteConfirmationProps = Readonly<{
  fromAssistant: boolean;
  open: boolean;
  pending: boolean;
  setOpen: (open: boolean) => void;
  trigger: ReactElement;
  onDelete: () => Promise<void>;
}>;

export function ThreadMessageDeleteConfirmation({
  fromAssistant,
  open,
  pending,
  setOpen,
  trigger,
  onDelete,
}: ThreadMessageDeleteConfirmationProps) {
  const [failed, setFailed] = useState(false);
  const deletionRequestPending = useRef(false);
  let heading = "Delete from here?";
  let description = "This message and every later turn will be deleted.";
  let error: string | undefined;

  if (fromAssistant) {
    heading = "Delete this turn?";
    description = "This response, its prompt, and every later turn will be deleted.";
  }

  if (failed) {
    error = "Couldn't delete these messages.";
  }

  function setConfirmationOpen(nextOpen: boolean) {
    if (nextOpen) {
      setFailed(false);
    }

    if (!pending && !deletionRequestPending.current) {
      setOpen(nextOpen);
    }
  }

  async function confirmDeletion() {
    if (pending || deletionRequestPending.current) {
      return;
    }

    deletionRequestPending.current = true;
    setFailed(false);

    try {
      await onDelete();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      deletionRequestPending.current = false;
    }
  }

  return (
    <ConfirmDialog
      open={open}
      setOpen={setConfirmationOpen}
      trigger={trigger}
      heading={heading}
      description={description}
      confirmLabel="Delete"
      pending={pending}
      error={error}
      onConfirm={() => void confirmDeletion()}
    />
  );
}
