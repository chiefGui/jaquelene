import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useIsTurnOperationPending } from "@/feature/thread/query";
import { useDeleteCampaign, useIsCampaignMutationPending } from "./query";

export function CampaignDeleteControl({
  campaign,
  replyActive,
}: {
  campaign: Campaign;
  replyActive: boolean;
}) {
  const deleteCampaign = useDeleteCampaign(campaign);
  const campaignMutationPending = useIsCampaignMutationPending(campaign.id);
  const turnOperationPending = useIsTurnOperationPending(campaign.threadId);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function setConfirmationOpen(nextOpen: boolean) {
    if (nextOpen) {
      deleteCampaign.reset();
    }

    if (!deleteCampaign.isPending) {
      setOpen(nextOpen);
    }
  }

  async function confirmDeletion() {
    try {
      await deleteCampaign.mutateAsync();
    } catch (cause) {
      reportError("campaign.delete", cause);
      return;
    }

    setOpen(false);

    try {
      await navigate({ to: "/campaigns/new", replace: true });
    } catch (cause) {
      reportError("campaign.open-after-delete", cause);
    }
  }

  const unavailable = campaignMutationPending || turnOperationPending || replyActive;

  return (
    <ConfirmDialog
      open={open}
      setOpen={setConfirmationOpen}
      trigger={
        <Button
          type="button"
          variant="ghost"
          tone="danger"
          disabled={unavailable}
          style={styles.trigger}
        >
          <HugeiconsIcon icon={TrashIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <Button.Label>Delete Campaign</Button.Label>
        </Button>
      }
      heading={`Delete “${campaign.title}”?`}
      description="This permanently deletes the campaign and its conversation. Usage history is kept."
      confirmLabel={deleteCampaign.isPending ? "Deleting…" : "Delete"}
      pending={deleteCampaign.isPending}
      error={deleteCampaign.isError ? "Couldn’t delete this campaign. Try again." : undefined}
      onConfirm={() => void confirmDeletion()}
    />
  );
}

const styles = stylex.create({
  trigger: {
    justifyContent: "flex-start",
    width: "100%",
  },
});
