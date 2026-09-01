import { and, count, desc, eq, isNotNull, ne, notExists, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import type { CampaignId } from "#backend/id";
import { turnTable } from "#backend/thread/schema";
import { providerAttemptTable } from "#backend/usage/schema";
import type { CostUsage, TokenUsage, UsageCoverage } from "#backend/usage/types";
import { campaignTable } from "./schema";

export type CampaignUsage = Readonly<{
  campaignId: CampaignId;
  attempts: Readonly<{
    provider: number;
    preparing: number;
    pending: number;
    completed: number;
    failed: number;
  }>;
  tokenCoverage: UsageCoverage;
  tokens?: TokenUsage;
  costCoverage: UsageCoverage;
  costs: readonly CostUsage[];
  models: readonly Readonly<{
    providerId: string;
    requestedModelId: string;
    resolvedModelId?: string;
    upstreamProviderId?: string;
    attempts: number;
  }>[];
}>;

function requireCount(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Campaign usage produced an invalid ${field}.`);
  }

  return value;
}

export function createCampaignUsage(database: Database) {
  return {
    get(campaignId: CampaignId): CampaignUsage | null {
      const campaign = database
        .select({ id: campaignTable.id, threadId: campaignTable.threadId })
        .from(campaignTable)
        .where(eq(campaignTable.id, campaignId))
        .get();

      if (!campaign) {
        return null;
      }

      const preparing = database
        .select({ attempts: count() })
        .from(generationTable)
        .innerJoin(turnTable, eq(turnTable.id, generationTable.turnId))
        .where(
          and(
            eq(turnTable.threadId, campaign.threadId),
            eq(generationTable.status, "pending"),
            notExists(
              database
                .select({ id: providerAttemptTable.id })
                .from(providerAttemptTable)
                .where(eq(providerAttemptTable.generationId, generationTable.id)),
            ),
          ),
        )
        .get();
      const settled = sql`${providerAttemptTable.status} <> 'pending'`;
      const reportedTokens = sql`${settled} AND ${providerAttemptTable.totalTokens} IS NOT NULL`;
      const reportedCost = sql`${settled} AND ${providerAttemptTable.costAmountNanos} IS NOT NULL`;
      const aggregate = database
        .select({
          providerAttempts: count(),
          pendingAttempts: sql<number>`coalesce(sum(CASE WHEN ${providerAttemptTable.status} = 'pending' THEN 1 ELSE 0 END), 0)`,
          completedAttempts: sql<number>`coalesce(sum(CASE WHEN ${providerAttemptTable.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
          failedAttempts: sql<number>`coalesce(sum(CASE WHEN ${providerAttemptTable.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
          reportedTokenAttempts: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN 1 ELSE 0 END), 0)`,
          unknownTokenAttempts: sql<number>`coalesce(sum(CASE WHEN ${settled} AND ${providerAttemptTable.totalTokens} IS NULL THEN 1 ELSE 0 END), 0)`,
          inputTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${providerAttemptTable.inputTokens} ELSE 0 END), 0)`,
          outputTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${providerAttemptTable.outputTokens} ELSE 0 END), 0)`,
          totalTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${providerAttemptTable.totalTokens} ELSE 0 END), 0)`,
          cacheReadInputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${providerAttemptTable.cacheReadInputTokens} ELSE 0 END), 0)`,
          cacheReadReports: sql<number>`coalesce(sum(CASE WHEN ${settled} AND ${providerAttemptTable.cacheReadInputTokens} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
          cacheWriteInputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${providerAttemptTable.cacheWriteInputTokens} ELSE 0 END), 0)`,
          cacheWriteReports: sql<number>`coalesce(sum(CASE WHEN ${settled} AND ${providerAttemptTable.cacheWriteInputTokens} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
          reasoningOutputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${providerAttemptTable.reasoningOutputTokens} ELSE 0 END), 0)`,
          reasoningReports: sql<number>`coalesce(sum(CASE WHEN ${settled} AND ${providerAttemptTable.reasoningOutputTokens} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
          reportedCostAttempts: sql<number>`coalesce(sum(CASE WHEN ${reportedCost} THEN 1 ELSE 0 END), 0)`,
          unknownCostAttempts: sql<number>`coalesce(sum(CASE WHEN ${settled} AND ${providerAttemptTable.costAmountNanos} IS NULL THEN 1 ELSE 0 END), 0)`,
        })
        .from(providerAttemptTable)
        .where(eq(providerAttemptTable.campaignId, campaignId))
        .get();

      if (!aggregate || !preparing) {
        throw new Error(`Campaign "${campaignId}" usage could not be aggregated.`);
      }

      const reportedTokenAttempts = requireCount(
        aggregate.reportedTokenAttempts,
        "reported token attempt count",
      );
      const costs = database
        .select({
          currency: providerAttemptTable.costCurrency,
          source: providerAttemptTable.costSource,
          amountNanos: sql<number>`sum(${providerAttemptTable.costAmountNanos})`,
          attempts: count(),
        })
        .from(providerAttemptTable)
        .where(
          and(
            eq(providerAttemptTable.campaignId, campaignId),
            ne(providerAttemptTable.status, "pending"),
            isNotNull(providerAttemptTable.costAmountNanos),
          ),
        )
        .groupBy(providerAttemptTable.costCurrency, providerAttemptTable.costSource)
        .orderBy(
          sql`CASE ${providerAttemptTable.costSource} WHEN 'provider-reported' THEN 0 ELSE 1 END`,
          providerAttemptTable.costCurrency,
        )
        .all()
        .map(({ currency, source, amountNanos, attempts }) => {
          if (
            currency === null ||
            !/^[A-Z]{3}$/.test(currency) ||
            (source !== "provider-reported" && source !== "estimated")
          ) {
            throw new TypeError("Campaign usage encountered unsupported cost metadata.");
          }

          return {
            currency,
            source,
            amountNanos: requireCount(amountNanos, "cost amount"),
            attempts: requireCount(attempts, "cost attempt count"),
          };
        });
      const models = database
        .select({
          providerId: providerAttemptTable.providerId,
          requestedModelId: providerAttemptTable.requestedModelId,
          resolvedModelId: providerAttemptTable.resolvedModelId,
          upstreamProviderId: providerAttemptTable.upstreamProviderId,
          attempts: count(),
        })
        .from(providerAttemptTable)
        .where(eq(providerAttemptTable.campaignId, campaignId))
        .groupBy(
          providerAttemptTable.providerId,
          providerAttemptTable.requestedModelId,
          providerAttemptTable.resolvedModelId,
          providerAttemptTable.upstreamProviderId,
        )
        .orderBy(
          desc(count()),
          providerAttemptTable.providerId,
          providerAttemptTable.requestedModelId,
          providerAttemptTable.resolvedModelId,
          providerAttemptTable.upstreamProviderId,
        )
        .all()
        .map(({ resolvedModelId, upstreamProviderId, attempts, ...model }) => ({
          ...model,
          ...(resolvedModelId === null ? {} : { resolvedModelId }),
          ...(upstreamProviderId === null ? {} : { upstreamProviderId }),
          attempts: requireCount(attempts, "model attempt count"),
        }));

      return {
        campaignId,
        attempts: {
          provider: requireCount(aggregate.providerAttempts, "provider attempt count"),
          preparing: requireCount(preparing.attempts, "preparing attempt count"),
          pending: requireCount(aggregate.pendingAttempts, "pending attempt count"),
          completed: requireCount(aggregate.completedAttempts, "completed attempt count"),
          failed: requireCount(aggregate.failedAttempts, "failed attempt count"),
        },
        tokenCoverage: {
          reported: reportedTokenAttempts,
          unknown: requireCount(aggregate.unknownTokenAttempts, "unknown token attempt count"),
        },
        ...(reportedTokenAttempts === 0
          ? {}
          : {
              tokens: {
                input: requireCount(aggregate.inputTokens, "input token count"),
                output: requireCount(aggregate.outputTokens, "output token count"),
                total: requireCount(aggregate.totalTokens, "total token count"),
                ...(requireCount(aggregate.cacheReadReports, "cache-read report count") === 0
                  ? {}
                  : {
                      cacheReadInput: requireCount(
                        aggregate.cacheReadInputTokens,
                        "cache-read input token count",
                      ),
                    }),
                ...(requireCount(aggregate.cacheWriteReports, "cache-write report count") === 0
                  ? {}
                  : {
                      cacheWriteInput: requireCount(
                        aggregate.cacheWriteInputTokens,
                        "cache-write input token count",
                      ),
                    }),
                ...(requireCount(aggregate.reasoningReports, "reasoning report count") === 0
                  ? {}
                  : {
                      reasoningOutput: requireCount(
                        aggregate.reasoningOutputTokens,
                        "reasoning output token count",
                      ),
                    }),
              },
            }),
        costCoverage: {
          reported: requireCount(aggregate.reportedCostAttempts, "reported cost attempt count"),
          unknown: requireCount(aggregate.unknownCostAttempts, "unknown cost attempt count"),
        },
        costs,
        models,
      };
    },
  };
}

export type CampaignUsageReader = ReturnType<typeof createCampaignUsage>;
