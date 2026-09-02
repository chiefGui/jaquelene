import type { CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import { formatCount, formatUsd } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import { SecondarySidebar } from "@/layout/secondary-sidebar";

function formatUsdNanos(amountNanos: number) {
  return formatUsd(amountNanos / 1_000_000_000);
}

function totalCostNanos(costs: CampaignUsageSnapshot["costs"]) {
  let total = 0;

  for (const cost of costs) {
    if (cost.currency !== "USD") {
      throw new TypeError(`Unsupported campaign cost currency: ${cost.currency}.`);
    }

    total += cost.amountNanos;

    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Campaign cost exceeds the supported amount.");
    }
  }

  return total;
}

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
  const costs = totalCostNanos(usage.costs);
  const costValue =
    usage.costs.length > 0
      ? `${formatUsdNanos(costs)}${usage.costCoverage.unknown > 0 ? "+" : ""}`
      : hasActivity
        ? "—"
        : formatUsdNanos(0);

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
