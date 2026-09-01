import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CampaignId, GenerationId, ProviderAttemptId, ThreadId } from "#backend/id";
import { generationCostSources } from "#backend/provider/provider";

export const providerAttemptStatuses = ["pending", "completed", "failed"] as const;
export const providerAttemptFailureKinds = [
  "provider",
  "invalid-output",
  "interrupted",
  "storage",
] as const;

export const providerAttemptTable = sqliteTable(
  "provider_attempts",
  {
    id: text().$type<ProviderAttemptId>().notNull(),
    generationId: text("generation_id").$type<GenerationId>().notNull(),
    threadId: text("thread_id").$type<ThreadId>().notNull(),
    campaignId: text("campaign_id").$type<CampaignId>(),
    providerId: text("provider_id").notNull(),
    requestedModelId: text("requested_model_id").notNull(),
    status: text({ enum: providerAttemptStatuses }).notNull(),
    failureKind: text("failure_kind", { enum: providerAttemptFailureKinds }),
    providerGenerationId: text("provider_generation_id"),
    resolvedModelId: text("resolved_model_id"),
    upstreamProviderId: text("upstream_provider_id"),
    finishReason: text("finish_reason"),
    inputTokens: integer("input_tokens"),
    cacheReadInputTokens: integer("cache_read_input_tokens"),
    cacheWriteInputTokens: integer("cache_write_input_tokens"),
    outputTokens: integer("output_tokens"),
    reasoningOutputTokens: integer("reasoning_output_tokens"),
    totalTokens: integer("total_tokens"),
    costCurrency: text("cost_currency"),
    costAmountNanos: integer("cost_amount_nanos"),
    costSource: text("cost_source", { enum: generationCostSources }),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (attempt) => [
    primaryKey({ columns: [attempt.id] }),
    index("provider_attempts_generation_idx").on(
      attempt.generationId,
      attempt.startedAt,
      attempt.id,
    ),
    index("provider_attempts_started_at_idx").on(attempt.startedAt, attempt.id),
    index("provider_attempts_campaign_started_at_idx").on(
      attempt.campaignId,
      attempt.startedAt,
      attempt.id,
    ),
    check(
      "provider_attempts_references_valid",
      sql`length(trim(${attempt.generationId})) > 0
        AND length(trim(${attempt.threadId})) > 0
        AND (${attempt.campaignId} IS NULL OR length(trim(${attempt.campaignId})) > 0)
        AND length(trim(${attempt.providerId})) > 0
        AND length(trim(${attempt.requestedModelId})) > 0`,
    ),
    check(
      "provider_attempts_status_valid",
      sql`${attempt.status} IN ('pending', 'completed', 'failed')`,
    ),
    check(
      "provider_attempts_failure_kind_valid",
      sql`${attempt.failureKind} IS NULL OR ${attempt.failureKind} IN ('provider', 'invalid-output', 'interrupted', 'storage')`,
    ),
    check(
      "provider_attempts_provider_result_valid",
      sql`(${attempt.providerGenerationId} IS NULL OR length(trim(${attempt.providerGenerationId})) > 0)
        AND (${attempt.resolvedModelId} IS NULL OR length(trim(${attempt.resolvedModelId})) > 0)
        AND (${attempt.upstreamProviderId} IS NULL OR length(trim(${attempt.upstreamProviderId})) > 0)
        AND (${attempt.finishReason} IS NULL OR length(trim(${attempt.finishReason})) > 0)`,
    ),
    check(
      "provider_attempts_usage_valid",
      sql`(${attempt.inputTokens} IS NULL AND ${attempt.outputTokens} IS NULL AND ${attempt.totalTokens} IS NULL)
        OR (${attempt.inputTokens} IS NOT NULL
          AND ${attempt.outputTokens} IS NOT NULL
          AND ${attempt.totalTokens} IS NOT NULL
          AND ${attempt.inputTokens} >= 0
          AND ${attempt.outputTokens} >= 0
          AND ${attempt.totalTokens} >= ${attempt.inputTokens}
          AND ${attempt.totalTokens} >= ${attempt.outputTokens})`,
    ),
    check(
      "provider_attempts_usage_details_valid",
      sql`(${attempt.cacheReadInputTokens} IS NULL
          OR (${attempt.inputTokens} IS NOT NULL
            AND ${attempt.cacheReadInputTokens} >= 0
            AND ${attempt.cacheReadInputTokens} <= ${attempt.inputTokens}))
        AND (${attempt.cacheWriteInputTokens} IS NULL
          OR (${attempt.inputTokens} IS NOT NULL
            AND ${attempt.cacheWriteInputTokens} >= 0
            AND ${attempt.cacheWriteInputTokens} <= ${attempt.inputTokens}))
        AND (${attempt.reasoningOutputTokens} IS NULL
          OR (${attempt.outputTokens} IS NOT NULL
            AND ${attempt.reasoningOutputTokens} >= 0
            AND ${attempt.reasoningOutputTokens} <= ${attempt.outputTokens}))`,
    ),
    check(
      "provider_attempts_cost_valid",
      sql`(${attempt.costCurrency} IS NULL
          AND ${attempt.costAmountNanos} IS NULL
          AND ${attempt.costSource} IS NULL)
        OR (${attempt.costCurrency} GLOB '[A-Z][A-Z][A-Z]'
          AND ${attempt.costAmountNanos} IS NOT NULL
          AND ${attempt.costAmountNanos} >= 0
          AND ${attempt.inputTokens} IS NOT NULL
          AND ${attempt.costSource} IN ('provider-reported', 'estimated'))`,
    ),
    check("provider_attempts_started_at_nonnegative", sql`${attempt.startedAt} >= 0`),
    check(
      "provider_attempts_finished_at_valid",
      sql`${attempt.finishedAt} IS NULL OR ${attempt.finishedAt} >= ${attempt.startedAt}`,
    ),
    check(
      "provider_attempts_state_valid",
      sql`(${attempt.status} = 'pending'
          AND ${attempt.finishedAt} IS NULL
          AND ${attempt.failureKind} IS NULL)
        OR (${attempt.status} = 'completed'
          AND ${attempt.finishedAt} IS NOT NULL
          AND ${attempt.failureKind} IS NULL)
        OR (${attempt.status} = 'failed'
          AND ${attempt.finishedAt} IS NOT NULL
          AND ${attempt.failureKind} IS NOT NULL)`,
    ),
  ],
);

export type ProviderAttempt = typeof providerAttemptTable.$inferSelect;
export type ProviderAttemptFailureKind = (typeof providerAttemptFailureKinds)[number];
