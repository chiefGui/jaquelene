import {
  PROMPT_MAX_LENGTH,
  SKILL_KEY_MAX_LENGTH,
  SKILL_KIND_KEY_MAX_LENGTH,
  SKILL_TITLE_MAX_LENGTH,
  SkillOrigin,
  type Prompt,
  type SkillKindKey,
  type SkillKey,
  type SkillTitle,
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
import { sqliteWhitespaceCharacters } from "#backend/database/sqlite-text";

const skillTitleMaxLengthSql = sql.raw(String(SKILL_TITLE_MAX_LENGTH));
const promptMaxLengthSql = sql.raw(String(PROMPT_MAX_LENGTH));
const skillKeyMaxLengthSql = sql.raw(String(SKILL_KEY_MAX_LENGTH));
const skillKindKeyMaxLengthSql = sql.raw(String(SKILL_KIND_KEY_MAX_LENGTH));

const skillOrigins = [SkillOrigin.BuiltIn, SkillOrigin.Custom] as const;
const builtInSkillOriginSql = sql.raw(`'${SkillOrigin.BuiltIn}'`);
const customSkillOriginSql = sql.raw(`'${SkillOrigin.Custom}'`);

export const skillKindTable = sqliteTable(
  "skill_kinds",
  {
    key: text().$type<SkillKindKey>().notNull(),
    name: text().notNull(),
    description: text().notNull(),
  },
  (kind) => [
    primaryKey({ columns: [kind.key] }),
    check(
      "skill_kinds_key_valid",
      sql`length(${kind.key}) > 0 AND length(${kind.key}) <= ${skillKindKeyMaxLengthSql} AND ${kind.key} NOT GLOB '*[^a-z0-9-]*' AND ${kind.key} GLOB '[a-z]*'`,
    ),
    check(
      "skill_kinds_name_valid",
      sql`${kind.name} = trim(${kind.name}, ${sqliteWhitespaceCharacters}) AND length(${kind.name}) > 0`,
    ),
    check(
      "skill_kinds_description_valid",
      sql`${kind.description} = trim(${kind.description}, ${sqliteWhitespaceCharacters}) AND length(${kind.description}) > 0`,
    ),
  ],
);

export const skillTable = sqliteTable(
  "skills",
  {
    key: text().$type<SkillKey>().notNull(),
    kind: text()
      .$type<SkillKindKey>()
      .notNull()
      .references(() => skillKindTable.key),
    origin: text({ enum: skillOrigins }).notNull(),
    title: text().$type<SkillTitle>().notNull(),
    prompt: text().$type<Prompt>().notNull(),
    createdAt: integer("created_at"),
    updatedAt: integer("updated_at"),
  },
  (skill) => [
    primaryKey({ columns: [skill.key] }),
    uniqueIndex("skills_kind_key_unique").on(skill.kind, skill.key),
    index("skills_kind_created_at_index").on(skill.kind, skill.createdAt, skill.key),
    check(
      "skills_key_valid",
      sql`length(${skill.key}) > 0 AND length(${skill.key}) <= ${skillKeyMaxLengthSql}`,
    ),
    check(
      "skills_origin_valid",
      sql`${skill.origin} IN (${builtInSkillOriginSql}, ${customSkillOriginSql})`,
    ),
    check(
      "skills_title_valid",
      sql`${skill.title} = trim(${skill.title}, ${sqliteWhitespaceCharacters}) AND length(${skill.title}) > 0 AND length(${skill.title}) <= ${skillTitleMaxLengthSql}`,
    ),
    check(
      "skills_prompt_valid",
      sql`length(trim(${skill.prompt}, ${sqliteWhitespaceCharacters})) > 0 AND length(${skill.prompt}) <= ${promptMaxLengthSql}`,
    ),
    check(
      "skills_lifecycle_valid",
      sql`(${skill.origin} = ${builtInSkillOriginSql} AND ${skill.createdAt} IS NULL AND ${skill.updatedAt} IS NULL) OR (${skill.origin} = ${customSkillOriginSql} AND ${skill.createdAt} IS NOT NULL AND ${skill.updatedAt} IS NOT NULL AND ${skill.createdAt} >= 0 AND ${skill.updatedAt} >= ${skill.createdAt})`,
    ),
  ],
);

export const skillKindFallbackTable = sqliteTable(
  "skill_kind_fallbacks",
  {
    kind: text()
      .$type<SkillKindKey>()
      .notNull()
      .references(() => skillKindTable.key, { onDelete: "cascade" }),
    skillKey: text("skill_key").$type<SkillKey>().notNull(),
  },
  (fallback) => [
    primaryKey({ columns: [fallback.kind] }),
    foreignKey({
      columns: [fallback.kind, fallback.skillKey],
      foreignColumns: [skillTable.kind, skillTable.key],
      name: "skill_kind_fallbacks_skill_fk",
    }).onDelete("restrict"),
    uniqueIndex("skill_kind_fallbacks_skill_unique").on(fallback.skillKey),
  ],
);

export const skillDefaultOverrideTable = sqliteTable(
  "skill_default_overrides",
  {
    kind: text()
      .$type<SkillKindKey>()
      .notNull()
      .references(() => skillKindTable.key, { onDelete: "cascade" }),
    skillKey: text("skill_key").$type<SkillKey>().notNull(),
  },
  (selection) => [
    primaryKey({ columns: [selection.kind] }),
    foreignKey({
      columns: [selection.kind, selection.skillKey],
      foreignColumns: [skillTable.kind, skillTable.key],
      name: "skill_default_overrides_skill_fk",
    }).onDelete("cascade"),
    index("skill_default_overrides_skill_index").on(selection.skillKey),
  ],
);
