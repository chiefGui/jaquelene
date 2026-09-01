import { and, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import type { CampaignId } from "#backend/id";
import type { GenerationCostSource } from "#backend/provider/provider";
import { turnTable } from "#backend/thread/schema";
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
  tokenCoverage: Readonly<{
    reported: number;
    unknown: number;
  }>;
  tokens?: Readonly<{
    input: number;
    output: number;
    total: number;
    cacheReadInput?: number;
    cacheWriteInput?: number;
    reasoningOutput?: number;
  }>;
  costCoverage: Readonly<{
    reported: number;
    unknown: number;
  }>;
  costs: readonly Readonly<{
    currency: "USD";
    source: GenerationCostSource;
    amountNanos: number;
    attempts: number;
  }>[];
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
      const dispatched = sql`${generationTable.providerStartedAt} IS NOT NULL`;
      const settled = sql`${dispatched} AND ${generationTable.status} <> 'pending'`;
      const reportedTokens = sql`${settled} AND ${generationTable.inputTokens} IS NOT NULL`;
      const reportedCost = sql`${settled} AND ${generationTable.costAmountNanos} IS NOT NULL`;
      const aggregate = database
        .select({
          campaignId: campaignTable.id,
          providerAttempts: sql<number>`sum(CASE WHEN ${dispatched} THEN 1 ELSE 0 END)`,
          preparingAttempts: sql<number>`sum(CASE WHEN ${generationTable.status} = 'pending' AND ${generationTable.providerStartedAt} IS NULL THEN 1 ELSE 0 END)`,
          pendingAttempts: sql<number>`sum(CASE WHEN ${dispatched} AND ${generationTable.status} = 'pending' THEN 1 ELSE 0 END)`,
          completedAttempts: sql<number>`sum(CASE WHEN ${dispatched} AND ${generationTable.status} = 'completed' THEN 1 ELSE 0 END)`,
          failedAttempts: sql<number>`sum(CASE WHEN ${dispatched} AND ${generationTable.status} = 'failed' THEN 1 ELSE 0 END)`,
          reportedTokenAttempts: sql<number>`sum(CASE WHEN ${reportedTokens} THEN 1 ELSE 0 END)`,
          unknownTokenAttempts: sql<number>`sum(CASE WHEN ${settled} AND ${generationTable.inputTokens} IS NULL THEN 1 ELSE 0 END)`,
          inputTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${generationTable.inputTokens} ELSE 0 END), 0)`,
          outputTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${generationTable.outputTokens} ELSE 0 END), 0)`,
          totalTokens: sql<number>`coalesce(sum(CASE WHEN ${reportedTokens} THEN ${generationTable.totalTokens} ELSE 0 END), 0)`,
          cacheReadInputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${generationTable.cacheReadInputTokens} ELSE 0 END), 0)`,
          cacheReadReports: sql<number>`sum(CASE WHEN ${settled} AND ${generationTable.cacheReadInputTokens} IS NOT NULL THEN 1 ELSE 0 END)`,
          cacheWriteInputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${generationTable.cacheWriteInputTokens} ELSE 0 END), 0)`,
          cacheWriteReports: sql<number>`sum(CASE WHEN ${settled} AND ${generationTable.cacheWriteInputTokens} IS NOT NULL THEN 1 ELSE 0 END)`,
          reasoningOutputTokens: sql<number>`coalesce(sum(CASE WHEN ${settled} THEN ${generationTable.reasoningOutputTokens} ELSE 0 END), 0)`,
          reasoningReports: sql<number>`sum(CASE WHEN ${settled} AND ${generationTable.reasoningOutputTokens} IS NOT NULL THEN 1 ELSE 0 END)`,
          reportedCostAttempts: sql<number>`sum(CASE WHEN ${reportedCost} THEN 1 ELSE 0 END)`,
          unknownCostAttempts: sql<number>`sum(CASE WHEN ${settled} AND ${generationTable.costAmountNanos} IS NULL THEN 1 ELSE 0 END)`,
        })
        .from(campaignTable)
        .leftJoin(turnTable, eq(turnTable.threadId, campaignTable.threadId))
        .leftJoin(generationTable, eq(generationTable.turnId, turnTable.id))
        .where(eq(campaignTable.id, campaignId))
        .groupBy(campaignTable.id)
        .get();

      if (!aggregate) {
        return null;
      }

      const reportedTokenAttempts = requireCount(
        aggregate.reportedTokenAttempts,
        "reported token attempt count",
      );
      const costs = database
        .select({
          currency: generationTable.costCurrency,
          source: generationTable.costSource,
          amountNanos: sql<number>`sum(${generationTable.costAmountNanos})`,
          attempts: count(),
        })
        .from(campaignTable)
        .innerJoin(turnTable, eq(turnTable.threadId, campaignTable.threadId))
        .innerJoin(generationTable, eq(generationTable.turnId, turnTable.id))
        .where(
          and(
            eq(campaignTable.id, campaignId),
            isNotNull(generationTable.providerStartedAt),
            ne(generationTable.status, "pending"),
            isNotNull(generationTable.costAmountNanos),
          ),
        )
        .groupBy(generationTable.costCurrency, generationTable.costSource)
        .orderBy(
          sql`CASE ${generationTable.costSource} WHEN 'provider-reported' THEN 0 ELSE 1 END`,
          generationTable.costCurrency,
        )
        .all()
        .map(({ currency, source, amountNanos, attempts }) => {
          if (currency !== "USD" || (source !== "provider-reported" && source !== "estimated")) {
            throw new TypeError("Campaign usage encountered unsupported cost metadata.");
          }

          return {
            currency: "USD" as const,
            source,
            amountNanos: requireCount(amountNanos, "cost amount"),
            attempts: requireCount(attempts, "cost attempt count"),
          };
        });
      const models = database
        .select({
          providerId: generationTable.providerId,
          requestedModelId: generationTable.modelId,
          resolvedModelId: generationTable.resolvedModelId,
          upstreamProviderId: generationTable.upstreamProviderId,
          attempts: count(),
        })
        .from(campaignTable)
        .innerJoin(turnTable, eq(turnTable.threadId, campaignTable.threadId))
        .innerJoin(generationTable, eq(generationTable.turnId, turnTable.id))
        .where(and(eq(campaignTable.id, campaignId), isNotNull(generationTable.providerStartedAt)))
        .groupBy(
          generationTable.providerId,
          generationTable.modelId,
          generationTable.resolvedModelId,
          generationTable.upstreamProviderId,
        )
        .orderBy(
          desc(count()),
          generationTable.providerId,
          generationTable.modelId,
          generationTable.resolvedModelId,
          generationTable.upstreamProviderId,
        )
        .all()
        .map(({ resolvedModelId, upstreamProviderId, attempts, ...model }) => ({
          ...model,
          ...(resolvedModelId === null ? {} : { resolvedModelId }),
          ...(upstreamProviderId === null ? {} : { upstreamProviderId }),
          attempts: requireCount(attempts, "model attempt count"),
        }));

      return {
        campaignId: aggregate.campaignId,
        attempts: {
          provider: requireCount(aggregate.providerAttempts, "provider attempt count"),
          preparing: requireCount(aggregate.preparingAttempts, "preparing attempt count"),
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
