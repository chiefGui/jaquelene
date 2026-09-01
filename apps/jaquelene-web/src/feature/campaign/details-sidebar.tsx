import type { CampaignUsageSnapshot } from "@jaquelene/ipc/renderer";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import { SecondarySidebar } from "@/layout/secondary-sidebar";

const integerFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const usdFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const preciseUsdFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function formatUsdNanos(amountNanos: number) {
  const amount = amountNanos / 1_000_000_000;
  return (amount > 0 && amount < 0.01 ? preciseUsdFormat : usdFormat).format(amount);
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
      <span {...stylex.props(styles.label)}>{label}</span>
    </p>
  );
}

export function CampaignDetailsSidebar({ usage }: { usage: CampaignUsageSnapshot }) {
  const headingId = useId();
  const activeAttempts = usage.attempts.preparing + usage.attempts.pending;
  const hasActivity = usage.attempts.provider > 0 || activeAttempts > 0;
  const tokensValue = usage.tokens
    ? `${integerFormat.format(usage.tokens.total)}${usage.tokenCoverage.unknown > 0 ? "+" : ""}`
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
        <SecondarySidebar.Heading id={headingId} {...stylex.props(styles.heading)}>
          Campaign details
        </SecondarySidebar.Heading>
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
  heading: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 600,
    lineHeight: tokens.lineHeightSmall,
  },
  body: {
    display: "grid",
    gap: "0.75rem",
    padding: "1rem",
  },
  metric: {
    alignItems: "baseline",
    display: "flex",
    gap: "0.25rem",
  },
  value: {
    color: tokens.foreground,
    fontSize: tokens.fontSizeLarge,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 550,
    letterSpacing: "-0.025em",
    lineHeight: tokens.lineHeightLarge,
  },
  label: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
