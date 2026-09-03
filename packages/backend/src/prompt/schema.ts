import {
  PROMPT_BODY_MAX_LENGTH,
  PROMPT_KEY_MAX_LENGTH,
  PROMPT_KIND_KEY_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  type PromptBody,
  type PromptKindKey,
  type PromptKey,
  type PromptTitle,
} from "@jaquelene/domain";
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
import { campaignTable } from "#backend/campaign/schema";
import { sqliteWhitespaceCharacters } from "#backend/database/sqlite-text";
import type { CampaignId } from "#backend/id";

const promptTitleMaxLengthSql = sql.raw(String(PROMPT_TITLE_MAX_LENGTH));
const promptBodyMaxLengthSql = sql.raw(String(PROMPT_BODY_MAX_LENGTH));
const promptKeyMaxLengthSql = sql.raw(String(PROMPT_KEY_MAX_LENGTH));
const promptKindKeyMaxLengthSql = sql.raw(String(PROMPT_KIND_KEY_MAX_LENGTH));

export const promptOrigins = ["factory", "custom"] as const;
export type PromptOrigin = (typeof promptOrigins)[number];

export const promptKindTable = sqliteTable(
  "prompt_kinds",
  {
    key: text().$type<PromptKindKey>().notNull(),
    name: text().notNull(),
    description: text().notNull(),
  },
  (kind) => [
    primaryKey({ columns: [kind.key] }),
    check(
      "prompt_kinds_key_valid",
      sql`length(${kind.key}) > 0 AND length(${kind.key}) <= ${promptKindKeyMaxLengthSql} AND ${kind.key} NOT GLOB '*[^a-z0-9-]*' AND ${kind.key} GLOB '[a-z]*'`,
    ),
    check(
      "prompt_kinds_name_valid",
      sql`${kind.name} = trim(${kind.name}, ${sqliteWhitespaceCharacters}) AND length(${kind.name}) > 0`,
    ),
    check(
      "prompt_kinds_description_valid",
      sql`${kind.description} = trim(${kind.description}, ${sqliteWhitespaceCharacters}) AND length(${kind.description}) > 0`,
    ),
  ],
);

export const promptTable = sqliteTable(
  "prompts",
  {
    key: text().$type<PromptKey>().notNull(),
    kind: text()
      .$type<PromptKindKey>()
      .notNull()
      .references(() => promptKindTable.key),
    origin: text({ enum: promptOrigins }).notNull(),
    title: text().$type<PromptTitle>().notNull(),
    body: text().$type<PromptBody>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (prompt) => [
    primaryKey({ columns: [prompt.key] }),
    uniqueIndex("prompts_kind_key_unique").on(prompt.kind, prompt.key),
    index("prompts_kind_created_at_index").on(prompt.kind, prompt.createdAt, prompt.key),
    check(
      "prompts_key_valid",
      sql`length(${prompt.key}) > 0 AND length(${prompt.key}) <= ${promptKeyMaxLengthSql}`,
    ),
    check("prompts_origin_valid", sql`${prompt.origin} IN ('factory', 'custom')`),
    check(
      "prompts_title_valid",
      sql`${prompt.title} = trim(${prompt.title}, ${sqliteWhitespaceCharacters}) AND length(${prompt.title}) > 0 AND length(${prompt.title}) <= ${promptTitleMaxLengthSql}`,
    ),
    check(
      "prompts_body_valid",
      sql`length(trim(${prompt.body}, ${sqliteWhitespaceCharacters})) > 0 AND length(${prompt.body}) <= ${promptBodyMaxLengthSql}`,
    ),
    check("prompts_created_at_nonnegative", sql`${prompt.createdAt} >= 0`),
  ],
);

export const promptKindFallbackTable = sqliteTable(
  "prompt_kind_fallbacks",
  {
    kind: text()
      .$type<PromptKindKey>()
      .notNull()
      .references(() => promptKindTable.key, { onDelete: "cascade" }),
    promptKey: text("prompt_key").$type<PromptKey>().notNull(),
  },
  (fallback) => [
    primaryKey({ columns: [fallback.kind] }),
    foreignKey({
      columns: [fallback.kind, fallback.promptKey],
      foreignColumns: [promptTable.kind, promptTable.key],
      name: "prompt_kind_fallbacks_prompt_fk",
    }).onDelete("restrict"),
    uniqueIndex("prompt_kind_fallbacks_prompt_unique").on(fallback.promptKey),
  ],
);

export const promptDefaultOverrideTable = sqliteTable(
  "prompt_default_overrides",
  {
    kind: text()
      .$type<PromptKindKey>()
      .notNull()
      .references(() => promptKindTable.key, { onDelete: "cascade" }),
    promptKey: text("prompt_key").$type<PromptKey>().notNull(),
  },
  (selection) => [
    primaryKey({ columns: [selection.kind] }),
    foreignKey({
      columns: [selection.kind, selection.promptKey],
      foreignColumns: [promptTable.kind, promptTable.key],
      name: "prompt_default_overrides_prompt_fk",
    }).onDelete("cascade"),
    index("prompt_default_overrides_prompt_index").on(selection.promptKey),
  ],
);

export const campaignPromptSelectionTable = sqliteTable(
  "campaign_prompt_selections",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    kind: text()
      .$type<PromptKindKey>()
      .notNull()
      .references(() => promptKindTable.key, { onDelete: "cascade" }),
    promptKey: text("prompt_key").$type<PromptKey>().notNull(),
  },
  (selection) => [
    primaryKey({ columns: [selection.campaignId, selection.kind] }),
    foreignKey({
      columns: [selection.kind, selection.promptKey],
      foreignColumns: [promptTable.kind, promptTable.key],
      name: "campaign_prompt_selections_prompt_fk",
    }).onDelete("cascade"),
    index("campaign_prompt_selections_prompt_index").on(selection.promptKey),
  ],
);
