import FileTextIcon from "@hugeicons/core-free-icons/FileTextIcon";
import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Campaign, CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import {
  IconButton,
  Item,
  Skeleton,
  Timestamp,
  formatCount,
  formatCurrencyNanos,
} from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { CampaignNarratorControl } from "@/feature/narrator/campaign-control";
import { useIsThreadOperationPending } from "@/feature/thread/query";
import { summarizeCosts } from "@/feature/usage/presentation";
import { ContentPane } from "@/layout/content-pane";
import { useDeleteCampaign, useIsCampaignMutationPending } from "./query";

function DeleteAction({ campaign, replyActive }: { campaign: Campaign; replyActive: boolean }) {
  const deleteCampaign = useDeleteCampaign(campaign);
  const campaignMutationPending = useIsCampaignMutationPending(campaign.id);
  const threadOperationPending = useIsThreadOperationPending(campaign.threadId);
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

  const unavailable = campaignMutationPending || threadOperationPending || replyActive;
  let confirmLabel = "Delete";
  let deleteTooltip = "Delete campaign";
  let deletionError: string | undefined;

  if (replyActive) {
    deleteTooltip = "Wait for the reply to finish before deleting.";
  } else if (campaignMutationPending || threadOperationPending) {
    deleteTooltip = "Wait for the current change to finish before deleting.";
  }

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
              <IconButton.Root
                aria-label={`Delete ${campaign.title}`}
                accessibleWhenDisabled
                disabled={unavailable}
              >
                <IconButton.Icon render={<HugeiconsIcon icon={TrashIcon} />} />
              </IconButton.Root>
            }
          />
        }
        heading={`Delete "${campaign.title}"?`}
        description="Permanently deletes this campaign and all its messages. This cannot be undone. Usage history is kept."
        confirmLabel={confirmLabel}
        pending={deleteCampaign.isPending}
        error={deletionError}
        onConfirm={() => void confirmDeletion()}
      />

      <Tooltip>{deleteTooltip}</Tooltip>
    </Tooltip.Root>
  );
}

function MetricRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <Item.Root inset="none" style={styles.metric}>
      <Item.Label render={<dt />}>{label}</Item.Label>
      <Item.Value render={<dd />} style={styles.metricValue}>
        {value}
      </Item.Value>
    </Item.Root>
  );
}

export function CampaignDetailsSkeleton() {
  return (
    <>
      <ContentPane.AsideViewport role="status" aria-label="Loading campaign details">
        <ContentPane.AsideBody aria-hidden="true">
          <Item.Root inset="none" style={styles.loadingControl}>
            <Skeleton style={styles.loadingLabel} />
            <Skeleton style={styles.loadingSelect} />
          </Item.Root>
        </ContentPane.AsideBody>

        <ContentPane.AsideBody render={<dl />} style={styles.metrics} aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <MetricRow
              key={`loading-${index}`}
              label={<Skeleton style={styles.loadingLabel} />}
              value={<Skeleton style={styles.loadingValue} />}
            />
          ))}
        </ContentPane.AsideBody>
      </ContentPane.AsideViewport>

      <ContentPane.AsideFooter aria-hidden="true">
        <Skeleton style={styles.loadingAction} />
        <Skeleton style={styles.loadingAction} />
      </ContentPane.AsideFooter>
    </>
  );
}

export function CampaignDetails({
  campaign,
  usage,
}: {
  campaign: Campaign;
  usage: CampaignUsageSnapshot;
}) {
  const activeAttempts = usage.attempts.preparing + usage.attempts.pending;
  const hasActivity = usage.attempts.provider > 0 || activeAttempts > 0;

  return (
    <>
      <ContentPane.AsideViewport>
        <ContentPane.AsideBody>
          <CampaignNarratorControl campaignId={campaign.id} />
        </ContentPane.AsideBody>

        <ContentPane.AsideBody render={<dl />} style={styles.metrics}>
          <MetricRow value={formatCount(campaign.turnCount)} label="Turns" />
          <MetricRow value={formatCampaignTokens(usage, hasActivity)} label="Tokens" />
          <MetricRow value={formatCampaignCost(usage, hasActivity)} label="Cost" />
          <MetricRow value={<Timestamp value={campaign.lastActivityAt} />} label="Last activity" />
          <MetricRow value={<Timestamp value={campaign.startedAt} />} label="Started" />
        </ContentPane.AsideBody>
      </ContentPane.AsideViewport>

      <ContentPane.AsideFooter role="group" aria-label="Campaign actions">
        <Tooltip.Root placement="top">
          <Tooltip.Anchor
            render={
              <IconButton.Root
                aria-label="View transcript"
                render={
                  <Link
                    to="/campaigns/$campaignId/transcript"
                    params={{ campaignId: campaign.id }}
                  />
                }
              >
                <IconButton.Icon render={<HugeiconsIcon icon={FileTextIcon} />} />
              </IconButton.Root>
            }
          />
          <Tooltip>Transcript</Tooltip>
        </Tooltip.Root>
        <DeleteAction campaign={campaign} replyActive={activeAttempts > 0} />
      </ContentPane.AsideFooter>
    </>
  );
}

const styles = stylex.create({
  metric: {
    alignItems: "baseline",
    gap: "1rem",
    minHeight: 0,
  },
  metrics: {
    display: "grid",
    gap: "0.875rem",
  },
  metricValue: {
    flexShrink: 1,
    margin: 0,
    textAlign: "end",
  },
  loadingControl: {
    gap: "1rem",
    minHeight: tokens.controlHeight,
  },
  loadingLabel: {
    display: "inline-block",
    height: "0.75rem",
    maxWidth: "100%",
    width: "5rem",
  },
  loadingValue: {
    display: "inline-block",
    height: "0.75rem",
    maxWidth: "100%",
    width: "6rem",
  },
  loadingSelect: {
    borderRadius: radii.control,
    height: tokens.controlHeight,
    maxWidth: "60%",
    width: "8rem",
  },
  loadingAction: {
    borderRadius: radii.control,
    height: tokens.controlHeight,
    width: tokens.controlHeight,
  },
});

function formatCampaignTokens(usage: CampaignUsageSnapshot, hasActivity: boolean) {
  if (usage.tokens) {
    let value = formatCount(usage.tokens.total);
    if (usage.tokenCoverage.unknown > 0) value += "+";
    return value;
  }

  if (hasActivity) return "—";
  return "0";
}

function formatCampaignCost(usage: CampaignUsageSnapshot, hasActivity: boolean) {
  const costs = summarizeCosts(usage.costs);

  if (costs.kind === "single-currency") {
    let value = formatCurrencyNanos(costs.amountNanos, costs.currency);
    if (costs.estimated) value = `~${value}`;
    if (usage.costCoverage.unknown > 0) value += "+";
    return value;
  }

  if (costs.kind === "multiple-currencies") return "Multiple currencies";
  if (hasActivity) return "—";
  return formatCurrencyNanos(0, "USD");
}
