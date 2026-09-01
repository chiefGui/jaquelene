import {
  CampaignCostSource,
  type CampaignCostUsage,
  type CampaignModelUsage,
  type CampaignUsageSnapshot,
} from "@jaquelene/ipc/renderer";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useId } from "react";
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

function formatCount(value: number) {
  return integerFormat.format(value);
}

function formatUsdNanos(amountNanos: number) {
  const amount = amountNanos / 1_000_000_000;
  return (amount > 0 && amount < 0.01 ? preciseUsdFormat : usdFormat).format(amount);
}

function attemptLabel(attempts: number) {
  return `${formatCount(attempts)} ${attempts === 1 ? "attempt" : "attempts"}`;
}

function costLabel(source: CampaignCostSource) {
  switch (source) {
    case CampaignCostSource.ProviderReported:
      return "Reported cost";
    case CampaignCostSource.Estimated:
      return "Estimated cost";
  }

  const unsupportedSource: never = source;
  throw new TypeError(`Unsupported campaign cost source: ${String(unsupportedSource)}`);
}

function DetailRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div {...stylex.props(styles.detailRow)}>
      <dt {...stylex.props(styles.detailLabel)}>{label}</dt>
      <dd {...stylex.props(styles.detailValue)}>{children}</dd>
    </div>
  );
}

function CostRow({ cost }: { cost: CampaignCostUsage }) {
  return (
    <DetailRow label={costLabel(cost.source)}>
      <span>{formatUsdNanos(cost.amountNanos)}</span>
      <span {...stylex.props(styles.detailMeta)}>{attemptLabel(cost.attempts)}</span>
    </DetailRow>
  );
}

function ModelRow({ model }: { model: CampaignModelUsage }) {
  const displayedModel = model.resolvedModelId ?? model.requestedModelId;
  const route = model.upstreamProviderId
    ? `${model.providerId} via ${model.upstreamProviderId}`
    : model.providerId;

  return (
    <li {...stylex.props(styles.model)}>
      <div {...stylex.props(styles.modelIdentity)}>
        <span {...stylex.props(styles.modelName)}>{displayedModel}</span>
        <span {...stylex.props(styles.modelProvider)}>{route}</span>
        {model.resolvedModelId && model.resolvedModelId !== model.requestedModelId ? (
          <span {...stylex.props(styles.modelProvider)}>Requested {model.requestedModelId}</span>
        ) : null}
      </div>
      <span {...stylex.props(styles.modelAttempts)}>{attemptLabel(model.attempts)}</span>
    </li>
  );
}

function CoverageNote({ usage }: { usage: CampaignUsageSnapshot }) {
  const covered = usage.tokenCoverage.reported;
  const settled = covered + usage.tokenCoverage.unknown;

  if (usage.tokenCoverage.unknown === 0) {
    return null;
  }

  return (
    <p {...stylex.props(styles.note)}>
      Token usage was reported for {formatCount(covered)} of {formatCount(settled)} settled
      attempts. Missing usage is not counted as zero.
    </p>
  );
}

export function CampaignUsageSidebar({ usage }: { usage: CampaignUsageSnapshot }) {
  const usageHeadingId = useId();
  const attemptsHeadingId = useId();
  const modelsHeadingId = useId();
  const activeAttempts = usage.attempts.preparing + usage.attempts.pending;
  const settledAttempts = usage.attempts.completed + usage.attempts.failed;
  const noActivity = usage.attempts.provider === 0 && activeAttempts === 0;

  return (
    <SecondarySidebar.Content aria-label="Campaign details">
      <SecondarySidebar.Header>
        <SecondarySidebar.Heading {...stylex.props(styles.heading)}>
          Campaign details
        </SecondarySidebar.Heading>
        <SecondarySidebar.Close />
      </SecondarySidebar.Header>

      <SecondarySidebar.Viewport>
        <SecondarySidebar.Body style={styles.body}>
          <section aria-labelledby={usageHeadingId} {...stylex.props(styles.section)}>
            <div {...stylex.props(styles.sectionHeader)}>
              <h2 id={usageHeadingId} {...stylex.props(styles.sectionHeading)}>
                Usage
              </h2>
              {activeAttempts > 0 ? (
                <span role="status" {...stylex.props(styles.updating)}>
                  Updating
                </span>
              ) : null}
            </div>

            {usage.tokens ? (
              <div {...stylex.props(styles.total)}>
                <span {...stylex.props(styles.totalValue)}>{formatCount(usage.tokens.total)}</span>
                <span {...stylex.props(styles.totalLabel)}>Total tokens</span>
              </div>
            ) : (
              <div {...stylex.props(styles.total)}>
                <span {...stylex.props(styles.emptyValue)}>
                  {noActivity
                    ? "No usage yet"
                    : settledAttempts > 0
                      ? "Not reported"
                      : "Waiting for usage"}
                </span>
                <span {...stylex.props(styles.totalLabel)}>Total tokens</span>
              </div>
            )}

            {usage.tokens || usage.costs.length > 0 ? (
              <dl {...stylex.props(styles.details)}>
                {usage.tokens ? (
                  <>
                    <DetailRow label="Input">{formatCount(usage.tokens.input)}</DetailRow>
                    <DetailRow label="Output">{formatCount(usage.tokens.output)}</DetailRow>
                    {usage.tokens.cacheReadInput !== undefined ? (
                      <DetailRow label="Cached input">
                        {formatCount(usage.tokens.cacheReadInput)}
                      </DetailRow>
                    ) : null}
                    {usage.tokens.cacheWriteInput !== undefined ? (
                      <DetailRow label="Cache writes">
                        {formatCount(usage.tokens.cacheWriteInput)}
                      </DetailRow>
                    ) : null}
                    {usage.tokens.reasoningOutput !== undefined ? (
                      <DetailRow label="Reasoning output">
                        {formatCount(usage.tokens.reasoningOutput)}
                      </DetailRow>
                    ) : null}
                  </>
                ) : null}
                {usage.costs.map((cost) => (
                  <CostRow key={`${cost.currency}:${cost.source}`} cost={cost} />
                ))}
              </dl>
            ) : null}

            <CoverageNote usage={usage} />
            {usage.costCoverage.unknown > 0 ? (
              <p {...stylex.props(styles.note)}>
                Cost was reported for {formatCount(usage.costCoverage.reported)} of{" "}
                {formatCount(usage.costCoverage.reported + usage.costCoverage.unknown)} settled
                attempts.
              </p>
            ) : null}
          </section>

          <section aria-labelledby={attemptsHeadingId} {...stylex.props(styles.section)}>
            <h2 id={attemptsHeadingId} {...stylex.props(styles.sectionHeading)}>
              Attempts
            </h2>
            <dl {...stylex.props(styles.details)}>
              <DetailRow label="Provider attempts">
                {formatCount(usage.attempts.provider)}
              </DetailRow>
              <DetailRow label="Completed">{formatCount(usage.attempts.completed)}</DetailRow>
              <DetailRow label="Failed">{formatCount(usage.attempts.failed)}</DetailRow>
              {usage.attempts.preparing > 0 ? (
                <DetailRow label="Preparing">{formatCount(usage.attempts.preparing)}</DetailRow>
              ) : null}
              {usage.attempts.pending > 0 ? (
                <DetailRow label="In progress">{formatCount(usage.attempts.pending)}</DetailRow>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby={modelsHeadingId} {...stylex.props(styles.section)}>
            <h2 id={modelsHeadingId} {...stylex.props(styles.sectionHeading)}>
              Models used
            </h2>
            {usage.models.length > 0 ? (
              <ul {...stylex.props(styles.models)}>
                {usage.models.map((model) => (
                  <ModelRow
                    key={`${model.providerId}:${model.requestedModelId}:${model.resolvedModelId ?? ""}:${model.upstreamProviderId ?? ""}`}
                    model={model}
                  />
                ))}
              </ul>
            ) : (
              <p {...stylex.props(styles.emptyDescription)}>No provider attempts yet.</p>
            )}
          </section>
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
    padding: 0,
  },
  section: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    padding: "1rem",
  },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  sectionHeading: {
    color: tokens.foreground,
    fontSize: tokens.fontSizeXSmall,
    fontWeight: 600,
    letterSpacing: "0.055em",
    lineHeight: tokens.lineHeightXSmall,
    textTransform: "uppercase",
  },
  updating: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  total: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    paddingBlock: "1.25rem 1rem",
  },
  totalValue: {
    color: tokens.foreground,
    fontSize: "1.75rem",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 550,
    letterSpacing: "-0.035em",
    lineHeight: "2rem",
  },
  emptyValue: {
    color: tokens.foreground,
    fontSize: tokens.fontSizeLarge,
    fontWeight: 550,
    lineHeight: tokens.lineHeightLarge,
  },
  totalLabel: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  details: {
    display: "grid",
    gap: "0.625rem",
    marginTop: "1rem",
  },
  detailRow: {
    alignItems: "baseline",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  detailLabel: {
    color: tokens.muted,
    minWidth: 0,
  },
  detailValue: {
    alignItems: "flex-end",
    color: tokens.foreground,
    display: "flex",
    flexDirection: "column",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  },
  detailMeta: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  note: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "1rem",
  },
  models: {
    display: "grid",
    gap: "0.875rem",
    marginTop: "1rem",
  },
  model: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  modelIdentity: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  modelName: {
    color: tokens.foreground,
    overflowWrap: "anywhere",
  },
  modelProvider: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    overflowWrap: "anywhere",
  },
  modelAttempts: {
    color: tokens.muted,
    flexShrink: 0,
    fontSize: tokens.fontSizeXSmall,
    fontVariantNumeric: "tabular-nums",
    lineHeight: tokens.lineHeightXSmall,
  },
  emptyDescription: {
    color: tokens.muted,
    marginTop: "1rem",
  },
});
