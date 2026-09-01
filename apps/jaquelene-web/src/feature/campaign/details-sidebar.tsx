import type { CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import { formatCount, formatCurrencyNanos } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import { SecondarySidebar } from "@/layout/secondary-sidebar";
import { summarizeCosts } from "@/feature/usage/presentation";

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <p {...stylex.props(styles.metric)}>
      <span {...stylex.props(styles.value)}>{value}</span>
      <span {...stylex.props(styles.label)}>{` ${label}`}</span>
    </p>
  );
}

export function CampaignDetailsSidebar({ usage }: { usage: CampaignUsageSnapshot }) {
  const headingId = useId();
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
          <MetricRow value={tokensValue} label="tokens" />
          <MetricRow value={costValue} label="cost" />
        </SecondarySidebar.Body>
      </SecondarySidebar.Viewport>
    </SecondarySidebar.Content>
  );
}

const styles = stylex.create({
  body: {
    display: "grid",
    gap: "0.75rem",
  },
  metric: {
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
  value: {
    color: tokens.foreground,
  },
  label: {
    color: tokens.muted,
  },
});
