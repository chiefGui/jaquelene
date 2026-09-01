import { UsagePeriod, type UsageOverview } from "@jaquelene/ipc/renderer";
import {
  Button,
  Item,
  formatCompactCount,
  formatCompactCurrencyNanos,
  formatCurrencyNanos,
} from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { Select } from "@jaquelene/ui/select";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { summarizeCosts } from "@/feature/usage/presentation";
import { usageOverviewQuery, useClearUsageHistory } from "@/feature/usage/query";
import { UsageChart, type UsageMetric } from "@/feature/usage/usage-chart";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const defaultPeriod = UsagePeriod.Last30Days;
const periodOptions = [
  { value: UsagePeriod.Last7Days, label: "Last 7 days" },
  { value: UsagePeriod.Last30Days, label: "Last 30 days" },
  { value: UsagePeriod.Last90Days, label: "Last 90 days" },
  { value: UsagePeriod.AllTime, label: "All time" },
] as const;

export const Route = createFileRoute("/settings/usage")({
  loader: ({ context }) => context.queryClient.query(usageOverviewQuery(defaultPeriod)),
  component: UsageRoute,
});

function presentTokens(overview: UsageOverview) {
  if (overview.tokenCoverage.reported > 0) {
    return `${formatCompactCount(overview.tokens?.total ?? 0)}${overview.tokenCoverage.unknown > 0 ? "+" : ""}`;
  }

  return overview.attempts.provider > 0 ? "—" : "0";
}

function presentCost(overview: UsageOverview) {
  const cost = summarizeCosts(overview.costs);

  if (cost.kind === "single-currency") {
    const estimate = cost.estimated ? "~" : "";
    const incomplete = overview.costCoverage.unknown > 0 ? "+" : "";
    return `${estimate}${formatCompactCurrencyNanos(cost.amountNanos, cost.currency)}${incomplete}`;
  }

  if (cost.kind === "multiple-currencies") {
    return "Multiple currencies";
  }

  return overview.attempts.provider > 0 ? "—" : formatCurrencyNanos(0, "USD");
}

function MetricTab({
  active,
  buttonRef,
  controls,
  id,
  label,
  metric,
  onNavigate,
  setMetric,
  value,
}: {
  active: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  controls: string;
  id: string;
  label: string;
  metric: UsageMetric;
  onNavigate: (metric: UsageMetric) => void;
  setMetric: (metric: UsageMetric) => void;
  value: string;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => setMetric(metric)}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        let nextMetric: UsageMetric | undefined;

        switch (event.key) {
          case "ArrowLeft":
          case "ArrowUp":
          case "ArrowRight":
          case "ArrowDown":
            nextMetric = metric === "tokens" ? "cost" : "tokens";
            break;
          case "Home":
            nextMetric = "tokens";
            break;
          case "End":
            nextMetric = "cost";
            break;
        }

        if (nextMetric) {
          event.preventDefault();
          onNavigate(nextMetric);
        }
      }}
      {...stylex.props(styles.metricTab)}
    >
      <span {...stylex.props(styles.metricValue)}>{value}</span>
      <span {...stylex.props(styles.metricLabel)}>{` ${label}`}</span>
    </button>
  );
}

function UsageRoute() {
  useSuspenseQuery(usageOverviewQuery(defaultPeriod));
  const [period, setPeriod] = useState<UsagePeriod>(defaultPeriod);
  const [metric, setMetric] = useState<UsageMetric>("tokens");
  const [clearOpen, setClearOpen] = useState(false);
  const metricPanelId = useId();
  const tokenTabId = useId();
  const costTabId = useId();
  const tokenTab = useRef<HTMLButtonElement>(null);
  const costTab = useRef<HTMLButtonElement>(null);
  const overviewQuery = useQuery({
    ...usageOverviewQuery(period),
    placeholderData: keepPreviousData,
  });
  const clearHistory = useClearUsageHistory();
  const overview = overviewQuery.data;

  if (!overview) {
    throw new Error("Usage overview is unavailable.");
  }

  if (overviewQuery.error) {
    throw overviewQuery.error;
  }

  const selectedPeriod = periodOptions.find((option) => option.value === period);

  if (!selectedPeriod) {
    throw new TypeError(`Unknown usage period "${period}".`);
  }

  const hasIncompleteReporting =
    overview.tokenCoverage.unknown > 0 || overview.costCoverage.unknown > 0;
  const costSummary = summarizeCosts(overview.costs);
  const hasEstimates = overview.costs.some((cost) => cost.source === "estimated");
  const hasMultipleCurrencies = costSummary.kind === "multiple-currencies";
  const reportingNote = [
    ...(hasMultipleCurrencies ? ["Costs are kept separate by currency."] : []),
    ...(hasIncompleteReporting ? ["Some attempts did not report complete usage."] : []),
    ...(hasEstimates && !hasMultipleCurrencies ? ["Estimated cost is marked with ~."] : []),
  ].join(" ");

  function navigateMetric(nextMetric: UsageMetric) {
    setMetric(nextMetric);
    queueMicrotask(() => (nextMetric === "tokens" ? tokenTab.current : costTab.current)?.focus());
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Usage</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <section aria-label="Usage overview" aria-busy={overviewQuery.isFetching || undefined}>
            <div {...stylex.props(styles.overviewHeader)}>
              <div role="tablist" aria-label="Usage metric" {...stylex.props(styles.metrics)}>
                <MetricTab
                  active={metric === "tokens"}
                  buttonRef={tokenTab}
                  controls={metricPanelId}
                  id={tokenTabId}
                  label="tokens"
                  metric="tokens"
                  onNavigate={navigateMetric}
                  setMetric={setMetric}
                  value={presentTokens(overview)}
                />
                <MetricTab
                  active={metric === "cost"}
                  buttonRef={costTab}
                  controls={metricPanelId}
                  id={costTabId}
                  label="cost"
                  metric="cost"
                  onNavigate={navigateMetric}
                  setMetric={setMetric}
                  value={presentCost(overview)}
                />
              </div>

              <Select.Root
                selectedValue={period}
                setSelectedValue={(value) => {
                  if (!periodOptions.some((option) => option.value === value)) {
                    throw new TypeError(`Unknown usage period "${value}".`);
                  }

                  setPeriod(value as UsagePeriod);
                }}
              >
                <Select aria-label="Usage period" variant="ghost">
                  <Select.Value>{selectedPeriod.label}</Select.Value>
                </Select>
                <Select.Content aria-label="Usage period" width="content">
                  {periodOptions.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.Indicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            <div
              id={metricPanelId}
              role="tabpanel"
              aria-labelledby={metric === "tokens" ? tokenTabId : costTabId}
            >
              <UsageChart
                key={`${overview.period}:${metric}`}
                metric={metric}
                overview={overview}
              />
            </div>

            {reportingNote ? <p {...stylex.props(styles.note)}>{reportingNote}</p> : null}
          </section>

          <section aria-labelledby="usage-history-heading" {...stylex.props(styles.history)}>
            <Item.Group>
              <Item.Root>
                <Item.Content>
                  <Item.Label id="usage-history-heading" render={<h2 />}>
                    Usage history
                  </Item.Label>
                  <Item.Description>
                    Clear totals without deleting campaigns or conversations.
                  </Item.Description>
                </Item.Content>

                <ConfirmDialog
                  open={clearOpen}
                  setOpen={(open) => {
                    if (!clearHistory.isPending) {
                      setClearOpen(open);
                      if (open) {
                        clearHistory.reset();
                      }
                    }
                  }}
                  heading="Clear usage history?"
                  description="Campaigns and conversations will remain, but usage totals and history will be permanently removed."
                  confirmLabel="Clear"
                  pending={clearHistory.isPending}
                  error={clearHistory.isError ? "Couldn’t clear usage history." : undefined}
                  onConfirm={() => {
                    clearHistory.mutate(undefined, {
                      onSuccess: () => setClearOpen(false),
                    });
                  }}
                  trigger={
                    <Button type="button" variant="ghost" tone="danger">
                      Clear
                    </Button>
                  }
                />
              </Item.Root>
            </Item.Group>
          </section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  overviewHeader: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  metrics: {
    display: "flex",
    gap: "1.5rem",
  },
  metricTab: {
    backgroundColor: "transparent",
    color: {
      default: tokens.muted,
      ':is([aria-selected="true"])': tokens.foreground,
      ":hover": tokens.foreground,
    },
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    outlineColor: {
      default: null,
      ":focus-visible": `color-mix(in oklab, ${tokens.accent} 60%, transparent)`,
    },
    outlineOffset: 3,
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
  metricValue: {
    color: "inherit",
  },
  metricLabel: {
    color: {
      default: `color-mix(in oklab, ${tokens.muted} 72%, transparent)`,
      [stylex.when.ancestor('[aria-selected="true"]')]: tokens.muted,
    },
  },
  note: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.75rem",
  },
  history: {
    marginTop: "4rem",
  },
});
