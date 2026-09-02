import type { Campaign, CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import { Timestamp, formatCount, formatCurrencyNanos } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId, type ReactNode } from "react";
import { CampaignNarratorControl } from "@/feature/prompt/campaign-control";
import { SecondarySidebar } from "@/layout/secondary-sidebar";
import { summarizeCosts } from "@/feature/usage/presentation";
import { CampaignDeleteControl } from "./delete-control";
import { CampaignTitleControl } from "./title-control";

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p {...stylex.props(styles.metric)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.value)}>{value}</span>
    </p>
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

            <div {...stylex.props(styles.metrics)}>
              <MetricRow value={formatCount(campaign.turnCount)} label="Turns" />
              <MetricRow value={tokensValue} label="Tokens" />
              <MetricRow value={costValue} label="Cost" />
              <MetricRow
                value={<Timestamp value={campaign.lastActivityAt} />}
                label="Last activity"
              />
              <MetricRow value={<Timestamp value={campaign.startedAt} />} label="Started" />
            </div>
          </section>
        </SecondarySidebar.Body>
      </SecondarySidebar.Viewport>

      <SecondarySidebar.Footer>
        <CampaignDeleteControl campaign={campaign} replyActive={activeAttempts > 0} />
      </SecondarySidebar.Footer>
    </SecondarySidebar.Content>
  );
}

const styles = stylex.create({
  body: {
    padding: 0,
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
    marginTop: "1rem",
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
    textAlign: "end",
  },
  label: {
    color: colors.foregroundSecondary,
  },
});
