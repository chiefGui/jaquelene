import { sql } from "drizzle-orm";
import { REGENERATION_INSTRUCTIONS_MAX_LENGTH } from "@jaquelene/domain";
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
import type { GenerationId, MessageId, ThreadId, TurnId } from "#backend/id";
import {
  reasoningPresets,
  reasoningPresetSources,
  requireResolvedReasoning,
  type ResolvedReasoning,
} from "#backend/model/reasoning";
import { threadMessageTable, threadTable, turnTable } from "#backend/thread/schema";

export const generationStatuses = ["pending", "completed", "failed"] as const;
export const generationIntents = ["reply", "retry", "regeneration"] as const;
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
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    turnId: text("turn_id")
      .$type<TurnId>()
      .references(() => turnTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    reasoningPreset: text("reasoning_preset", { enum: reasoningPresets }),
    reasoningPresetSource: text("reasoning_preset_source", { enum: reasoningPresetSources }),
    intent: text({ enum: generationIntents }).notNull(),
    status: text({ enum: generationStatuses }).notNull(),
    failureKind: text("failure_kind", { enum: generationFailureKinds }),
    outputMessageId: text("output_message_id").$type<MessageId>(),
    regenerationSourceMessageId: text("regeneration_source_message_id").$type<MessageId>(),
    regenerationInstructions: text("regeneration_instructions"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (generation) => [
    primaryKey({ columns: [generation.id] }),
    foreignKey({
      columns: [generation.threadId, generation.turnId],
      foreignColumns: [turnTable.threadId, turnTable.id],
      name: "generations_thread_turn_fk",
    }),
    foreignKey({
      columns: [generation.threadId, generation.outputMessageId],
      foreignColumns: [threadMessageTable.threadId, threadMessageTable.id],
      name: "generations_thread_output_fk",
    }),
    foreignKey({
      columns: [generation.threadId, generation.regenerationSourceMessageId],
      foreignColumns: [threadMessageTable.threadId, threadMessageTable.id],
      name: "generations_thread_source_fk",
    }),
    check(
      "generations_opening_valid",
      sql`${generation.turnId} IS NOT NULL OR (${generation.intent} = 'regeneration' AND ${generation.regenerationSourceMessageId} IS NOT NULL)`,
    ),
    index("generations_thread_turn_started_at_idx").on(
      generation.threadId,
      generation.turnId,
      generation.startedAt,
      generation.id,
    ),
    uniqueIndex("generations_pending_opening_unique")
      .on(generation.threadId)
      .where(sql`${generation.turnId} IS NULL AND ${generation.status} = 'pending'`),
    foreignKey({
      columns: [generation.turnId, generation.outputMessageId],
      foreignColumns: [threadMessageTable.turnId, threadMessageTable.id],
      name: "generations_output_message_fk",
    }),
    foreignKey({
      columns: [generation.turnId, generation.regenerationSourceMessageId],
      foreignColumns: [threadMessageTable.turnId, threadMessageTable.id],
      name: "generations_regeneration_source_fk",
    }),
    check(
      "generations_regeneration_valid",
      sql`(${generation.intent} != 'regeneration' AND ${generation.regenerationSourceMessageId} IS NULL AND ${generation.regenerationInstructions} IS NULL)
        OR (${generation.intent} = 'regeneration'
          AND ${generation.regenerationSourceMessageId} IS NOT NULL
          AND (${generation.regenerationInstructions} IS NULL OR length(trim(${generation.regenerationInstructions})) BETWEEN 1 AND ${sql.raw(String(REGENERATION_INSTRUCTIONS_MAX_LENGTH))}))`,
    ),
    index("generations_turn_started_at_idx").on(
      generation.turnId,
      generation.startedAt,
      generation.id,
    ),
    uniqueIndex("generations_pending_turn_unique")
      .on(generation.turnId)
      .where(sql`${generation.status} = 'pending'`),
    uniqueIndex("generations_output_message_unique").on(generation.outputMessageId),
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
      "generations_intent_valid",
      sql`${generation.intent} IN ('reply', 'retry', 'regeneration')`,
    ),
    check(
      "generations_status_valid",
      sql`${generation.status} IN ('pending', 'completed', 'failed')`,
    ),
    check(
      "generations_failure_kind_valid",
      sql`${generation.failureKind} IS NULL OR ${generation.failureKind} IN ('preparation', 'provider', 'invalid-output', 'interrupted', 'storage')`,
    ),
    check("generations_started_at_nonnegative", sql`${generation.startedAt} >= 0`),
    check(
      "generations_finished_at_valid",
      sql`${generation.finishedAt} IS NULL
        OR ${generation.finishedAt} >= ${generation.startedAt}`,
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
export type Generation = Omit<
  StoredGeneration,
  | "reasoningPreset"
  | "reasoningPresetSource"
  | "regenerationSourceMessageId"
  | "regenerationInstructions"
> & {
  reasoning?: ResolvedReasoning;
  regeneration?: Readonly<{ sourceMessageId: MessageId; instructions?: string }>;
};
export type GenerationIntent = (typeof generationIntents)[number];
export type GenerationFailureKind = (typeof generationFailureKinds)[number];

export function toGeneration({
  reasoningPreset,
  reasoningPresetSource,
  regenerationSourceMessageId,
  regenerationInstructions,
  ...generation
}: StoredGeneration): Generation {
  const result: Generation = { ...generation };
  if (regenerationSourceMessageId === null && regenerationInstructions !== null) {
    throw new TypeError(`Generation "${generation.id}" has incomplete regeneration metadata.`);
  }
  if (regenerationSourceMessageId !== null) {
    result.regeneration = {
      sourceMessageId: regenerationSourceMessageId,
      ...(regenerationInstructions !== null && { instructions: regenerationInstructions }),
    };
  }

  if (reasoningPreset === null && reasoningPresetSource === null) {
    return result;
  }

  if (reasoningPreset === null || reasoningPresetSource === null) {
    throw new TypeError(`Generation "${generation.id}" has incomplete reasoning metadata.`);
  }

  return {
    ...result,
    reasoning: requireResolvedReasoning({
      preset: reasoningPreset,
      source: reasoningPresetSource,
    }),
  };
}
