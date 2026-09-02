import type { UsageBucket, UsageOverview } from "@jaquelene/ipc/renderer";
import { formatCount, formatCurrencyNanos } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { summarizeCosts } from "./presentation";

export type UsageMetric = "tokens" | "cost";

const bucketDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const bucketDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function bucketLabel(bucket: UsageBucket) {
  const startsAt = bucketDateWithYearFormatter.format(bucket.startsAt);
  const inclusiveEnd = Math.max(bucket.startsAt, bucket.endsAt - 1);
  const endsAt = bucketDateWithYearFormatter.format(inclusiveEnd);
  return startsAt === endsAt ? startsAt : `${startsAt} – ${endsAt}`;
}

function bucketValue(bucket: UsageBucket, metric: UsageMetric) {
  if (metric === "tokens") {
    return bucket.tokens?.total ?? 0;
  }

  const cost = summarizeCosts(bucket.costs);
  return cost.kind === "single-currency" ? cost.amountNanos : 0;
}

function presentBucketValue(bucket: UsageBucket, metric: UsageMetric) {
  const coverage = metric === "tokens" ? bucket.tokenCoverage : bucket.costCoverage;
  const hasKnownValue = coverage.reported > 0;

  if (!hasKnownValue) {
    return bucket.attempts.pending > 0
      ? "In progress"
      : coverage.unknown > 0
        ? "Not reported"
        : metric === "tokens"
          ? "0 tokens"
          : "$0 cost";
  }

  if (metric === "tokens") {
    return `${formatCount(bucket.tokens?.total ?? 0)}${coverage.unknown > 0 ? "+" : ""} tokens`;
  }

  const cost = summarizeCosts(bucket.costs);

  if (cost.kind !== "single-currency") {
    return cost.kind === "multiple-currencies" ? "Multiple currencies" : "Cost not reported";
  }

  return `${cost.estimated ? "~" : ""}${formatCurrencyNanos(cost.amountNanos, cost.currency)}${coverage.unknown > 0 ? "+" : ""} cost`;
}

function chartEmptyMessage(overview: UsageOverview, metric: UsageMetric) {
  if (overview.attempts.provider === 0) {
    return "No usage in this period";
  }

  const coverage = metric === "tokens" ? overview.tokenCoverage : overview.costCoverage;
  const cost = summarizeCosts(overview.costs);

  if (overview.attempts.pending === overview.attempts.provider) {
    return "Usage is in progress.";
  }

  if (metric === "cost" && cost.kind === "multiple-currencies") {
    return "Cost is reported in multiple currencies.";
  }

  return coverage.reported === 0
    ? `${metric === "tokens" ? "Tokens were" : "Cost was"} not reported in this period.`
    : null;
}

export function UsageChart({ metric, overview }: { metric: UsageMetric; overview: UsageOverview }) {
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, overview.buckets.length - 1));
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const values = overview.buckets.map((bucket) => bucketValue(bucket, metric));
  const maximum = Math.max(...values, 0);
  const activeBucket = overview.buckets[activeIndex];
  const emptyMessage = chartEmptyMessage(overview, metric);

  function activate(index: number, focus: boolean) {
    const boundedIndex = Math.max(0, Math.min(overview.buckets.length - 1, index));
    setActiveIndex(boundedIndex);

    if (focus) {
      optionRefs.current[boundedIndex]?.focus();
    }
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index - 1;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index + 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = overview.buckets.length - 1;
        break;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      activate(nextIndex, true);
    }
  }

  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.readout)}>
        {activeBucket ? (
          <>
            <span {...stylex.props(styles.readoutDate)}>{bucketLabel(activeBucket)}</span>
            <span>{presentBucketValue(activeBucket, metric)}</span>
          </>
        ) : (
          <span>{emptyMessage}</span>
        )}
      </p>

      {emptyMessage ? (
        <div {...stylex.props(styles.empty)}>{emptyMessage}</div>
      ) : (
        <div
          role="listbox"
          aria-label={`${metric === "tokens" ? "Token" : "Cost"} usage over time`}
          aria-orientation="horizontal"
          {...stylex.props(styles.plot)}
          style={{
            gridTemplateColumns: `repeat(${overview.buckets.length}, minmax(0, 1fr))`,
          }}
        >
          {overview.buckets.map((bucket, index) => {
            const height = maximum === 0 ? 0 : Math.max(0.025, values[index]! / maximum);
            const label = `${bucketLabel(bucket)}: ${presentBucketValue(bucket, metric)}`;

            return (
              <button
                key={bucket.startsAt}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-label={label}
                aria-selected={index === activeIndex}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => activate(index, false)}
                onFocus={() => activate(index, false)}
                onKeyDown={(event) => onOptionKeyDown(event, index)}
                onPointerEnter={() => activate(index, false)}
                {...stylex.props(styles.barButton)}
              >
                <span
                  aria-hidden="true"
                  {...stylex.props(styles.bar)}
                  style={{ "--usage-bar-height": `${height * 100}%` } as CSSProperties}
                />
              </button>
            );
          })}
        </div>
      )}

      <div aria-hidden="true" {...stylex.props(styles.axis)}>
        <span>{bucketDateFormatter.format(overview.startsAt)}</span>
        <span>{bucketDateFormatter.format(Math.max(overview.startsAt, overview.endsAt - 1))}</span>
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    marginTop: "1.5rem",
  },
  readout: {
    color: colors.foregroundPrimary,
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    justifyContent: "space-between",
    lineHeight: tokens.lineHeightSmall,
    minHeight: tokens.lineHeightSmall,
  },
  readoutDate: {
    color: colors.foregroundSecondary,
  },
  plot: {
    alignItems: "stretch",
    display: "grid",
    gap: "0.1875rem",
    height: "10rem",
    marginTop: "0.75rem",
  },
  barButton: {
    alignItems: "flex-end",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklab, ${colors.foregroundAccent} 8%, transparent)`,
    },
    borderRadius: tokens.radiusSmall,
    display: "flex",
    minWidth: 0,
    outlineColor: {
      default: null,
      ":focus-visible": colors.focusRing,
    },
    outlineOffset: -1,
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    padding: 0,
  },
  bar: {
    backgroundColor: {
      default: `color-mix(in oklab, ${colors.foregroundSecondary} 28%, transparent)`,
      [stylex.when.ancestor('[aria-selected="true"]')]: colors.foregroundAccent,
      [stylex.when.ancestor(":hover")]:
        `color-mix(in oklab, ${colors.foregroundAccent} 68%, transparent)`,
    },
    borderRadius: "0.125rem 0.125rem 0 0",
    height: "var(--usage-bar-height)",
    minHeight: "0.125rem",
    width: "100%",
  },
  empty: {
    alignItems: "center",
    color: colors.foregroundSecondary,
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    height: "10rem",
    justifyContent: "center",
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  axis: {
    color: colors.foregroundSecondary,
    display: "flex",
    fontSize: tokens.fontSizeXSmall,
    justifyContent: "space-between",
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.5rem",
  },
});
