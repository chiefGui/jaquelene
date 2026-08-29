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
import type { GenerationId, MessageId, ThreadId } from "@/id";
import { threadMessageTable, threadTable } from "../thread/schema";

export const generationStatuses = ["pending", "completed", "failed"] as const;
export const generationFailureKinds = [
  "provider",
  "invalid-output",
  "superseded",
  "interrupted",
  "storage",
] as const;

export const generationTable = sqliteTable(
  "generations",
  {
    id: text().$type<GenerationId>().notNull(),
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    contextSequence: integer("context_sequence").notNull(),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    status: text({ enum: generationStatuses }).notNull(),
    failureKind: text("failure_kind", { enum: generationFailureKinds }),
    providerGenerationId: text("provider_generation_id"),
    resolvedModelId: text("resolved_model_id"),
    finishReason: text("finish_reason"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    outputMessageId: text("output_message_id")
      .$type<MessageId>()
      .references(() => threadMessageTable.id),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (generation) => [
    primaryKey({ columns: [generation.id] }),
    foreignKey({
      columns: [generation.threadId, generation.contextSequence],
      foreignColumns: [threadMessageTable.threadId, threadMessageTable.sequence],
      name: "generations_context_message_fk",
    }),
    index("generations_thread_idx").on(generation.threadId),
    uniqueIndex("generations_pending_thread_unique")
      .on(generation.threadId)
      .where(sql`${generation.status} = 'pending'`),
    uniqueIndex("generations_output_message_unique").on(generation.outputMessageId),
    uniqueIndex("generations_provider_generation_unique").on(
      generation.providerId,
      generation.providerGenerationId,
    ),
    check("generations_context_sequence_positive", sql`${generation.contextSequence} > 0`),
    check(
      "generations_model_reference_valid",
      sql`length(trim(${generation.providerId})) > 0 AND length(trim(${generation.modelId})) > 0`,
    ),
    check(
      "generations_status_valid",
      sql`${generation.status} IN ('pending', 'completed', 'failed')`,
    ),
    check(
      "generations_failure_kind_valid",
      sql`${generation.failureKind} IS NULL OR ${generation.failureKind} IN ('provider', 'invalid-output', 'superseded', 'interrupted', 'storage')`,
    ),
    check(
      "generations_provider_result_valid",
      sql`(${generation.providerGenerationId} IS NULL OR length(trim(${generation.providerGenerationId})) > 0)
        AND (${generation.resolvedModelId} IS NULL OR length(trim(${generation.resolvedModelId})) > 0)
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
          AND ${generation.totalTokens} >= 0)`,
    ),
    check("generations_started_at_nonnegative", sql`${generation.startedAt} >= 0`),
    check(
      "generations_finished_at_valid",
      sql`${generation.finishedAt} IS NULL OR ${generation.finishedAt} >= ${generation.startedAt}`,
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

export type Generation = typeof generationTable.$inferSelect;
export type GenerationFailureKind = (typeof generationFailureKinds)[number];
