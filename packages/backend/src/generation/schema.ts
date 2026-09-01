import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { GenerationId, MessageId, TurnId } from "#backend/id";
import {
  reasoningPresets,
  reasoningPresetSources,
  requireResolvedReasoning,
  type ResolvedReasoning,
} from "#backend/model/reasoning";
import { generationCostSources } from "#backend/provider/provider";
import { threadMessageTable, turnTable } from "#backend/thread/schema";

export const generationStatuses = ["pending", "completed", "failed"] as const;
export const generationFailureKinds = [
  "preparation",
  "provider",
  "invalid-output",
  "interrupted",
  "storage",
] as const;
export const generationTable = sqliteTable(
  "generations",
  {
    id: text().$type<GenerationId>().notNull(),
    turnId: text("turn_id")
      .$type<TurnId>()
      .notNull()
      .references(() => turnTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    reasoningPreset: text("reasoning_preset", { enum: reasoningPresets }),
    reasoningPresetSource: text("reasoning_preset_source", { enum: reasoningPresetSources }),
    status: text({ enum: generationStatuses }).notNull(),
    failureKind: text("failure_kind", { enum: generationFailureKinds }),
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
    outputMessageId: text("output_message_id").$type<MessageId>(),
    startedAt: integer("started_at").notNull(),
    providerStartedAt: integer("provider_started_at"),
    finishedAt: integer("finished_at"),
  },
  (generation) => [
    primaryKey({ columns: [generation.id] }),
    foreignKey({
      columns: [generation.turnId, generation.outputMessageId],
      foreignColumns: [threadMessageTable.turnId, threadMessageTable.id],
      name: "generations_output_message_fk",
    }),
    index("generations_turn_started_at_idx").on(
      generation.turnId,
      generation.startedAt,
      generation.id,
    ),
    uniqueIndex("generations_pending_turn_unique")
      .on(generation.turnId)
      .where(sql`${generation.status} = 'pending'`),
    uniqueIndex("generations_output_message_unique").on(generation.outputMessageId),
    uniqueIndex("generations_provider_generation_unique").on(
      generation.providerId,
      generation.providerGenerationId,
    ),
    check(
      "generations_model_reference_valid",
      sql`length(trim(${generation.providerId})) > 0 AND length(trim(${generation.modelId})) > 0`,
    ),
    check(
      "generations_reasoning_valid",
      sql`(${generation.reasoningPreset} IS NULL AND ${generation.reasoningPresetSource} IS NULL)
        OR (${generation.reasoningPreset} IS NOT NULL
          AND ${generation.reasoningPresetSource} IS NOT NULL
          AND ${generation.reasoningPreset} IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')
          AND ${generation.reasoningPresetSource} IN ('model-default', 'selection'))`,
    ),
    check(
      "generations_status_valid",
      sql`${generation.status} IN ('pending', 'completed', 'failed')`,
    ),
    check(
      "generations_failure_kind_valid",
      sql`${generation.failureKind} IS NULL OR ${generation.failureKind} IN ('preparation', 'provider', 'invalid-output', 'interrupted', 'storage')`,
    ),
    check(
      "generations_provider_result_valid",
      sql`(${generation.providerGenerationId} IS NULL OR length(trim(${generation.providerGenerationId})) > 0)
        AND (${generation.resolvedModelId} IS NULL OR length(trim(${generation.resolvedModelId})) > 0)
        AND (${generation.upstreamProviderId} IS NULL OR length(trim(${generation.upstreamProviderId})) > 0)
        AND (${generation.finishReason} IS NULL OR length(trim(${generation.finishReason})) > 0)`,
    ),
    check(
      "generations_usage_valid",
      sql`(${generation.inputTokens} IS NULL AND ${generation.outputTokens} IS NULL AND ${generation.totalTokens} IS NULL)
        OR (${generation.inputTokens} IS NOT NULL
          AND ${generation.outputTokens} IS NOT NULL
          AND ${generation.totalTokens} IS NOT NULL
          AND ${generation.inputTokens} >= 0
          AND ${generation.outputTokens} >= 0
          AND ${generation.totalTokens} >= ${generation.inputTokens}
          AND ${generation.totalTokens} >= ${generation.outputTokens})`,
    ),
    check(
      "generations_usage_details_valid",
      sql`(${generation.cacheReadInputTokens} IS NULL
          OR (${generation.inputTokens} IS NOT NULL
            AND ${generation.cacheReadInputTokens} >= 0
            AND ${generation.cacheReadInputTokens} <= ${generation.inputTokens}))
        AND (${generation.cacheWriteInputTokens} IS NULL
          OR (${generation.inputTokens} IS NOT NULL
            AND ${generation.cacheWriteInputTokens} >= 0
            AND ${generation.cacheWriteInputTokens} <= ${generation.inputTokens}))
        AND (${generation.reasoningOutputTokens} IS NULL
          OR (${generation.outputTokens} IS NOT NULL
            AND ${generation.reasoningOutputTokens} >= 0
            AND ${generation.reasoningOutputTokens} <= ${generation.outputTokens}))`,
    ),
    check(
      "generations_cost_valid",
      sql`(${generation.costCurrency} IS NULL
          AND ${generation.costAmountNanos} IS NULL
          AND ${generation.costSource} IS NULL)
        OR (${generation.costCurrency} = 'USD'
          AND ${generation.costAmountNanos} IS NOT NULL
          AND ${generation.costAmountNanos} >= 0
          AND ${generation.inputTokens} IS NOT NULL
          AND ${generation.costSource} IN ('provider-reported', 'estimated'))`,
    ),
    check("generations_started_at_nonnegative", sql`${generation.startedAt} >= 0`),
    check(
      "generations_provider_started_at_valid",
      sql`${generation.providerStartedAt} IS NULL
        OR ${generation.providerStartedAt} >= ${generation.startedAt}`,
    ),
    check(
      "generations_finished_at_valid",
      sql`${generation.finishedAt} IS NULL
        OR (${generation.finishedAt} >= ${generation.startedAt}
          AND (${generation.providerStartedAt} IS NULL
            OR ${generation.finishedAt} >= ${generation.providerStartedAt}))`,
    ),
    check(
      "generations_provider_attempt_valid",
      sql`(${generation.status} <> 'completed' OR ${generation.providerStartedAt} IS NOT NULL)
        AND (${generation.failureKind} <> 'preparation' OR ${generation.providerStartedAt} IS NULL)
        AND (${generation.failureKind} NOT IN ('provider', 'invalid-output')
          OR ${generation.providerStartedAt} IS NOT NULL)
        AND ((${generation.providerGenerationId} IS NULL
            AND ${generation.resolvedModelId} IS NULL
            AND ${generation.upstreamProviderId} IS NULL
            AND ${generation.finishReason} IS NULL
            AND ${generation.inputTokens} IS NULL
            AND ${generation.costAmountNanos} IS NULL)
          OR ${generation.providerStartedAt} IS NOT NULL)`,
    ),
    check(
      "generations_state_valid",
      sql`(${generation.status} = 'pending'
          AND ${generation.finishedAt} IS NULL
          AND ${generation.failureKind} IS NULL
          AND ${generation.outputMessageId} IS NULL)
        OR (${generation.status} = 'completed'
          AND ${generation.finishedAt} IS NOT NULL
          AND ${generation.failureKind} IS NULL
          AND ${generation.outputMessageId} IS NOT NULL)
        OR (${generation.status} = 'failed'
          AND ${generation.finishedAt} IS NOT NULL
          AND ${generation.failureKind} IS NOT NULL
          AND ${generation.outputMessageId} IS NULL)`,
    ),
  ],
);

export type StoredGeneration = typeof generationTable.$inferSelect;
export type Generation = Omit<StoredGeneration, "reasoningPreset" | "reasoningPresetSource"> & {
  reasoning?: ResolvedReasoning;
};
export type GenerationFailureKind = (typeof generationFailureKinds)[number];

export function toGeneration({
  reasoningPreset,
  reasoningPresetSource,
  ...generation
}: StoredGeneration): Generation {
  if (reasoningPreset === null && reasoningPresetSource === null) {
    return generation;
  }

  if (reasoningPreset === null || reasoningPresetSource === null) {
    throw new TypeError(`Generation "${generation.id}" has incomplete reasoning metadata.`);
  }

  return {
    ...generation,
    reasoning: requireResolvedReasoning({
      preset: reasoningPreset,
      source: reasoningPresetSource,
    }),
  };
}
