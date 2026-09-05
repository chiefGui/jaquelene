import { sql } from "drizzle-orm";
import type { SkillKey, SkillKindKey } from "@jaquelene/domain";
import { skillKindTable, skillTable } from "#backend/skill/schema";
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
import { CAMPAIGN_TITLE_MAX_LENGTH, type CampaignTitle } from "@jaquelene/domain";
import type { CampaignId, ThreadId } from "#backend/id";
import { reasoningPresets } from "#backend/model/reasoning";
import { sqliteWhitespaceCharacters } from "#backend/database/sqlite-text";
import { threadTable } from "#backend/thread/schema";

const campaignTitleMaxLengthSql = sql.raw(String(CAMPAIGN_TITLE_MAX_LENGTH));

export const campaignTable = sqliteTable(
  "campaigns",
  {
    id: text().$type<CampaignId>().notNull(),
    title: text().$type<CampaignTitle>().notNull(),
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id),
    startedAt: integer("started_at").notNull(),
  },
  (campaign) => [
    primaryKey({ columns: [campaign.id] }),
    uniqueIndex("campaigns_thread_unique").on(campaign.threadId),
    check(
      "campaigns_title_valid",
      sql`${campaign.title} = trim(${campaign.title}, ${sqliteWhitespaceCharacters}) AND length(${campaign.title}) > 0 AND length(${campaign.title}) <= ${campaignTitleMaxLengthSql}`,
    ),
    check("campaigns_started_at_nonnegative", sql`${campaign.startedAt} >= 0`),
  ],
);

export const campaignGenerationPreferencesTable = sqliteTable(
  "campaign_generation_preferences",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    name: text(),
    brandId: text("brand_id"),
    reasoningPreset: text("reasoning_preset", { enum: reasoningPresets }),
  },
  (preferences) => [
    primaryKey({ columns: [preferences.campaignId] }),
    check(
      "campaign_generation_preferences_values_valid",
      sql`(
          (${preferences.providerId} IS NULL
            AND ${preferences.modelId} IS NULL
            AND ${preferences.name} IS NULL
            AND ${preferences.brandId} IS NULL)
          OR
          (${preferences.providerId} IS NOT NULL
            AND ${preferences.modelId} IS NOT NULL
            AND ${preferences.name} IS NOT NULL
            AND ${preferences.brandId} IS NOT NULL
            AND length(trim(${preferences.providerId})) > 0
            AND length(trim(${preferences.modelId})) > 0
            AND length(trim(${preferences.name})) > 0
            AND length(trim(${preferences.brandId})) > 0)
        )
        AND (${preferences.providerId} IS NOT NULL OR ${preferences.reasoningPreset} IS NOT NULL)
        AND (${preferences.reasoningPreset} IS NULL OR ${preferences.reasoningPreset} IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))`,
    ),
  ],
);

export const campaignSkillSelectionTable = sqliteTable(
  "campaign_skill_selections",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    kind: text()
      .$type<SkillKindKey>()
      .notNull()
      .references(() => skillKindTable.key, { onDelete: "cascade" }),
    skillKey: text("skill_key").$type<SkillKey>().notNull(),
  },
  (selection) => [
    primaryKey({ columns: [selection.campaignId, selection.kind] }),
    foreignKey({
      columns: [selection.kind, selection.skillKey],
      foreignColumns: [skillTable.kind, skillTable.key],
      name: "campaign_skill_selections_skill_fk",
    }).onDelete("cascade"),
    index("campaign_skill_selections_skill_index").on(selection.skillKey),
  ],
);
