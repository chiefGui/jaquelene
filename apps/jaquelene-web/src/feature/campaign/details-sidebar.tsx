import FileTextIcon from "@hugeicons/core-free-icons/FileTextIcon";
import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Campaign, CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import { IconButton, Timestamp, formatCount, formatCurrencyNanos } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState, type ReactNode } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { CampaignNarratorControl } from "@/feature/narrator/campaign-control";
import { useIsTurnOperationPending } from "@/feature/thread/query";
import { SecondarySidebar } from "@/layout/secondary-sidebar";
import { summarizeCosts } from "@/feature/usage/presentation";
import { useDeleteCampaign, useIsCampaignMutationPending } from "./query";
import { CampaignTitleControl } from "./title-control";

function TranscriptAction({ threadId }: { threadId: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        render={
          <IconButton
            render={<Link to="/threads/$threadId/transcript" params={{ threadId }} />}
            aria-label="Open thread transcript"
          >
            <HugeiconsIcon icon={FileTextIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        }
      />

      <Tooltip>Transcript</Tooltip>
    </Tooltip.Root>
  );
}

function DeleteAction({ campaign, replyActive }: { campaign: Campaign; replyActive: boolean }) {
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
  let confirmLabel = "Delete";
  let deletionError: string | undefined;

  if (deleteCampaign.isPending) {
    confirmLabel = "Deleting\u2026";
  }

  if (deleteCampaign.isError) {
    deletionError = "Couldn't delete this campaign. Try again.";
  }

  return (
    <Tooltip.Root>
      <ConfirmDialog
        open={open}
        setOpen={setConfirmationOpen}
        trigger={
          <Tooltip.Anchor
            render={
              <IconButton
                type="button"
                tone="danger"
                aria-label={`Delete ${campaign.title}`}
                disabled={unavailable}
              >
                <HugeiconsIcon icon={TrashIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
            }
          />
        }
        heading={`Delete "${campaign.title}"?`}
        description="This permanently deletes the campaign and its conversation. Usage history is kept."
        confirmLabel={confirmLabel}
        pending={deleteCampaign.isPending}
        error={deletionError}
        onConfirm={() => void confirmDeletion()}
      />

      <Tooltip>Delete</Tooltip>
    </Tooltip.Root>
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div {...stylex.props(styles.metric)}>
      <dt {...stylex.props(styles.label)}>{label}</dt>
      <dd {...stylex.props(styles.value)}>{value}</dd>
    </div>
  );
}

export function CampaignDetailsSidebar({
  campaign,
  usage,
}: {
  campaign: Campaign;
  usage: CampaignUsageSnapshot;
}) {
  const headingId = useId();
  const metadataHeadingId = useId();
  const activeAttempts = usage.attempts.preparing + usage.attempts.pending;
  const hasActivity = usage.attempts.provider > 0 || activeAttempts > 0;
  const tokensValue = usage.tokens
    ? `${formatCount(usage.tokens.total)}${usage.tokenCoverage.unknown > 0 ? "+" : ""}`
    : hasActivity
      ? "—"
      : "0";
  const costs = summarizeCosts(usage.costs);
  const costValue =
    costs.kind === "single-currency"
      ? `${costs.estimated ? "~" : ""}${formatCurrencyNanos(costs.amountNanos, costs.currency)}${usage.costCoverage.unknown > 0 ? "+" : ""}`
      : costs.kind === "multiple-currencies"
        ? "Multiple currencies"
        : hasActivity
          ? "—"
          : formatCurrencyNanos(0, "USD");

  return (
    <SecondarySidebar.Content aria-labelledby={headingId}>
      <SecondarySidebar.Header>
        <SecondarySidebar.Heading id={headingId}>Campaign details</SecondarySidebar.Heading>
        <SecondarySidebar.Close aria-label="Close campaign details" />
      </SecondarySidebar.Header>

      <SecondarySidebar.Viewport>
        <SecondarySidebar.Body style={styles.body}>
          <div {...stylex.props(styles.controls)}>
            <CampaignTitleControl campaign={campaign} />
            <CampaignNarratorControl campaignId={campaign.id} />
          </div>

          <section aria-labelledby={metadataHeadingId} {...stylex.props(styles.metadata)}>
            <h2 id={metadataHeadingId} {...stylex.props(styles.metadataHeading)}>
              Metadata
            </h2>

            <dl {...stylex.props(styles.metrics)}>
              <MetricRow value={formatCount(campaign.turnCount)} label="Turns" />
              <MetricRow value={tokensValue} label="Tokens" />
              <MetricRow value={costValue} label="Cost" />
              <MetricRow
                value={<Timestamp value={campaign.lastActivityAt} />}
                label="Last activity"
              />
              <MetricRow value={<Timestamp value={campaign.startedAt} />} label="Started" />
            </dl>
          </section>
        </SecondarySidebar.Body>
      </SecondarySidebar.Viewport>

      <SecondarySidebar.Footer style={styles.footer}>
        <TranscriptAction threadId={campaign.threadId} />
        <DeleteAction campaign={campaign} replyActive={activeAttempts > 0} />
      </SecondarySidebar.Footer>
    </SecondarySidebar.Content>
  );
}

const styles = stylex.create({
  body: {
    padding: 0,
  },
  footer: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    justifyContent: "flex-end",
  },
  controls: {
    display: "grid",
    gap: "1rem",
    padding: "1rem",
  },
  metadata: {
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    padding: "1rem",
  },
  metadataHeading: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
  },
  metrics: {
    display: "grid",
    gap: "0.75rem",
    marginBlock: "1rem 0",
  },
  metric: {
    alignItems: "baseline",
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    gap: "1rem",
    justifyContent: "space-between",
    lineHeight: tokens.lineHeightSmall,
  },
  value: {
    color: `color-mix(in oklch, ${colors.foregroundPrimary} 60%, ${colors.foregroundSecondary})`,
    fontVariantNumeric: "tabular-nums",
    margin: 0,
    textAlign: "end",
  },
  label: {
    color: colors.foregroundSecondary,
  },
});
