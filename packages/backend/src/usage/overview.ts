import { min } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import type { CostUsage, TokenUsage, UsageCoverage } from "./types";
import { createUsageTimeRange, type UsagePeriod, type UsageTimeBucket } from "./calendar";
import { providerAttemptTable } from "./schema";

export type UsageAttempts = Readonly<{
  provider: number;
  pending: number;
  completed: number;
  failed: number;
}>;

export type UsageBucket = UsageTimeBucket &
  Readonly<{
    attempts: UsageAttempts;
    tokenCoverage: UsageCoverage;
    tokens?: TokenUsage;
    costCoverage: UsageCoverage;
    costs: readonly CostUsage[];
  }>;

export type UsageOverview = Readonly<{
  hasHistory: boolean;
  period: UsagePeriod;
  granularity: "day" | "week" | "month" | "quarter" | "year";
  startsAt: number;
  endsAt: number;
  attempts: UsageAttempts;
  tokenCoverage: UsageCoverage;
  tokens?: TokenUsage;
  costCoverage: UsageCoverage;
  costs: readonly CostUsage[];
  buckets: readonly UsageBucket[];
}>;

type AggregateRow = {
  ordinal: unknown;
  providerAttempts: unknown;
  pendingAttempts: unknown;
  completedAttempts: unknown;
  failedAttempts: unknown;
  reportedTokenAttempts: unknown;
  unknownTokenAttempts: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
  totalTokens: unknown;
  cacheReadInputTokens: unknown;
  cacheReadReports: unknown;
  cacheWriteInputTokens: unknown;
  cacheWriteReports: unknown;
  reasoningOutputTokens: unknown;
  reasoningReports: unknown;
  reportedCostAttempts: unknown;
  unknownCostAttempts: unknown;
};

type CostRow = {
  ordinal: unknown;
  currency: unknown;
  source: unknown;
  amountNanos: unknown;
  attempts: unknown;
};

function requireCount(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Usage overview produced an invalid ${field}.`);
  }

  return value;
}

function addCounts(left: number, right: number, field: string) {
  const result = left + right;

  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`Usage overview exceeded the supported ${field}.`);
  }

  return result;
}

function bucketRangesSql(buckets: readonly UsageTimeBucket[]) {
  if (buckets.length === 0) {
    throw new RangeError("Usage overview requires at least one time bucket.");
  }

  return {
    values: buckets.map(() => "(?, ?, ?)").join(", "),
    parameters: buckets.flatMap((bucket, ordinal) => [ordinal, bucket.startsAt, bucket.endsAt]),
  };
}

function aggregateBuckets(database: Database, buckets: readonly UsageTimeBucket[]) {
  const range = bucketRangesSql(buckets);
  const rows = database.$client
    .prepare(
      `WITH bucket_ranges(ordinal, starts_at, ends_at) AS (VALUES ${range.values})
       SELECT b.ordinal AS ordinal,
         count(a.id) AS providerAttempts,
         coalesce(sum(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingAttempts,
         coalesce(sum(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedAttempts,
         coalesce(sum(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END), 0) AS failedAttempts,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.total_tokens IS NOT NULL THEN 1 ELSE 0 END), 0) AS reportedTokenAttempts,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.total_tokens IS NULL THEN 1 ELSE 0 END), 0) AS unknownTokenAttempts,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.input_tokens ELSE 0 END), 0) AS inputTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.output_tokens ELSE 0 END), 0) AS outputTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.total_tokens ELSE 0 END), 0) AS totalTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.cache_read_input_tokens ELSE 0 END), 0) AS cacheReadInputTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.cache_read_input_tokens IS NOT NULL THEN 1 ELSE 0 END), 0) AS cacheReadReports,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.cache_write_input_tokens ELSE 0 END), 0) AS cacheWriteInputTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.cache_write_input_tokens IS NOT NULL THEN 1 ELSE 0 END), 0) AS cacheWriteReports,
         coalesce(sum(CASE WHEN a.status <> 'pending' THEN a.reasoning_output_tokens ELSE 0 END), 0) AS reasoningOutputTokens,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.reasoning_output_tokens IS NOT NULL THEN 1 ELSE 0 END), 0) AS reasoningReports,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.cost_amount_nanos IS NOT NULL THEN 1 ELSE 0 END), 0) AS reportedCostAttempts,
         coalesce(sum(CASE WHEN a.status <> 'pending' AND a.cost_amount_nanos IS NULL THEN 1 ELSE 0 END), 0) AS unknownCostAttempts
       FROM bucket_ranges b
       LEFT JOIN provider_attempts a INDEXED BY provider_attempts_started_at_idx
         ON a.started_at >= b.starts_at AND a.started_at < b.ends_at
       GROUP BY b.ordinal
       ORDER BY b.ordinal`,
    )
    .all(...range.parameters) as AggregateRow[];

  if (rows.length !== buckets.length) {
    throw new Error("Usage overview returned an incomplete bucket series.");
  }

  return rows;
}

function aggregateCosts(database: Database, buckets: readonly UsageTimeBucket[]) {
  const range = bucketRangesSql(buckets);
  return database.$client
    .prepare(
      `WITH bucket_ranges(ordinal, starts_at, ends_at) AS (VALUES ${range.values})
       SELECT b.ordinal AS ordinal, a.cost_currency AS currency, a.cost_source AS source,
         sum(a.cost_amount_nanos) AS amountNanos, count(a.id) AS attempts
       FROM bucket_ranges b
       INNER JOIN provider_attempts a INDEXED BY provider_attempts_started_at_idx
         ON a.started_at >= b.starts_at AND a.started_at < b.ends_at
       WHERE a.status <> 'pending' AND a.cost_amount_nanos IS NOT NULL
       GROUP BY b.ordinal, a.cost_currency, a.cost_source
       ORDER BY b.ordinal,
         CASE a.cost_source WHEN 'provider-reported' THEN 0 ELSE 1 END,
         a.cost_currency`,
    )
    .all(...range.parameters) as CostRow[];
}

function toCosts(rows: readonly CostRow[], ordinal: number) {
  return rows
    .filter((row) => requireCount(row.ordinal, "cost bucket ordinal") === ordinal)
    .map((row): CostUsage => {
      if (
        typeof row.currency !== "string" ||
        !/^[A-Z]{3}$/.test(row.currency) ||
        (row.source !== "provider-reported" && row.source !== "estimated")
      ) {
        throw new TypeError("Usage overview encountered unsupported cost metadata.");
      }

      return {
        currency: row.currency,
        source: row.source,
        amountNanos: requireCount(row.amountNanos, "cost amount"),
        attempts: requireCount(row.attempts, "cost attempt count"),
      };
    });
}

function toBucket(
  range: UsageTimeBucket,
  row: AggregateRow,
  costs: readonly CostUsage[],
  ordinal: number,
): UsageBucket {
  if (requireCount(row.ordinal, "bucket ordinal") !== ordinal) {
    throw new Error("Usage overview returned buckets out of order.");
  }

  const reportedTokens = requireCount(row.reportedTokenAttempts, "reported token attempt count");
  const cacheReadReports = requireCount(row.cacheReadReports, "cache-read report count");
  const cacheWriteReports = requireCount(row.cacheWriteReports, "cache-write report count");
  const reasoningReports = requireCount(row.reasoningReports, "reasoning report count");

  return {
    ...range,
    attempts: {
      provider: requireCount(row.providerAttempts, "provider attempt count"),
      pending: requireCount(row.pendingAttempts, "pending attempt count"),
      completed: requireCount(row.completedAttempts, "completed attempt count"),
      failed: requireCount(row.failedAttempts, "failed attempt count"),
    },
    tokenCoverage: {
      reported: reportedTokens,
      unknown: requireCount(row.unknownTokenAttempts, "unknown token attempt count"),
    },
    ...(reportedTokens === 0
      ? {}
      : {
          tokens: {
            input: requireCount(row.inputTokens, "input token count"),
            output: requireCount(row.outputTokens, "output token count"),
            total: requireCount(row.totalTokens, "total token count"),
            ...(cacheReadReports === 0
              ? {}
              : {
                  cacheReadInput: requireCount(row.cacheReadInputTokens, "cache-read token count"),
                }),
            ...(cacheWriteReports === 0
              ? {}
              : {
                  cacheWriteInput: requireCount(
                    row.cacheWriteInputTokens,
                    "cache-write token count",
                  ),
                }),
            ...(reasoningReports === 0
              ? {}
              : {
                  reasoningOutput: requireCount(row.reasoningOutputTokens, "reasoning token count"),
                }),
          },
        }),
    costCoverage: {
      reported: requireCount(row.reportedCostAttempts, "reported cost attempt count"),
      unknown: requireCount(row.unknownCostAttempts, "unknown cost attempt count"),
    },
    costs,
  };
}

function sumBuckets(buckets: readonly UsageBucket[]) {
  const attempts = { provider: 0, pending: 0, completed: 0, failed: 0 };
  const tokenCoverage = { reported: 0, unknown: 0 };
  const costCoverage = { reported: 0, unknown: 0 };
  let tokens: TokenUsage | undefined;
  const costs = new Map<string, CostUsage>();

  for (const bucket of buckets) {
    for (const key of ["provider", "pending", "completed", "failed"] as const) {
      attempts[key] = addCounts(attempts[key], bucket.attempts[key], `${key} attempt count`);
    }
    tokenCoverage.reported = addCounts(
      tokenCoverage.reported,
      bucket.tokenCoverage.reported,
      "token coverage",
    );
    tokenCoverage.unknown = addCounts(
      tokenCoverage.unknown,
      bucket.tokenCoverage.unknown,
      "token coverage",
    );
    costCoverage.reported = addCounts(
      costCoverage.reported,
      bucket.costCoverage.reported,
      "cost coverage",
    );
    costCoverage.unknown = addCounts(
      costCoverage.unknown,
      bucket.costCoverage.unknown,
      "cost coverage",
    );

    if (bucket.tokens) {
      const current = tokens ?? { input: 0, output: 0, total: 0 };
      tokens = {
        input: addCounts(current.input, bucket.tokens.input, "input token count"),
        output: addCounts(current.output, bucket.tokens.output, "output token count"),
        total: addCounts(current.total, bucket.tokens.total, "total token count"),
        ...(current.cacheReadInput === undefined && bucket.tokens.cacheReadInput === undefined
          ? {}
          : {
              cacheReadInput: addCounts(
                current.cacheReadInput ?? 0,
                bucket.tokens.cacheReadInput ?? 0,
                "cache-read token count",
              ),
            }),
        ...(current.cacheWriteInput === undefined && bucket.tokens.cacheWriteInput === undefined
          ? {}
          : {
              cacheWriteInput: addCounts(
                current.cacheWriteInput ?? 0,
                bucket.tokens.cacheWriteInput ?? 0,
                "cache-write token count",
              ),
            }),
        ...(current.reasoningOutput === undefined && bucket.tokens.reasoningOutput === undefined
          ? {}
          : {
              reasoningOutput: addCounts(
                current.reasoningOutput ?? 0,
                bucket.tokens.reasoningOutput ?? 0,
                "reasoning token count",
              ),
            }),
      };
    }

    for (const cost of bucket.costs) {
      const key = `${cost.currency}:${cost.source}`;
      const current = costs.get(key);
      costs.set(key, {
        ...cost,
        amountNanos: addCounts(current?.amountNanos ?? 0, cost.amountNanos, "cost amount"),
        attempts: addCounts(current?.attempts ?? 0, cost.attempts, "cost attempt count"),
      });
    }
  }

  const orderedCosts = [...costs.values()].sort(
    (left, right) =>
      (left.source === right.source ? 0 : left.source === "provider-reported" ? -1 : 1) ||
      left.currency.localeCompare(right.currency),
  );
  return { attempts, tokenCoverage, tokens, costCoverage, costs: orderedCosts };
}

export function createUsageOverviewReader(database: Database, now: () => number = Date.now) {
  return {
    get(period: UsagePeriod): UsageOverview {
      const earliest =
        database
          .select({ value: min(providerAttemptTable.startedAt) })
          .from(providerAttemptTable)
          .get()?.value ?? null;
      const range = createUsageTimeRange(period, period === "all-time" ? earliest : null, now());
      const aggregateRows = aggregateBuckets(database, range.buckets);
      const costRows = aggregateCosts(database, range.buckets);
      const buckets = range.buckets.map((bucket, ordinal) =>
        toBucket(bucket, aggregateRows[ordinal]!, toCosts(costRows, ordinal), ordinal),
      );
      const summary = sumBuckets(buckets);

      return {
        hasHistory: earliest !== null,
        period,
        granularity: range.granularity,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        attempts: summary.attempts,
        tokenCoverage: summary.tokenCoverage,
        ...(summary.tokens ? { tokens: summary.tokens } : {}),
        costCoverage: summary.costCoverage,
        costs: summary.costs,
        buckets,
      };
    },
  };
}

export type UsageOverviewReader = ReturnType<typeof createUsageOverviewReader>;
