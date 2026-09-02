import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH,
  type RoleplayInstructionBody,
  type RoleplayInstructionTitle,
} from "@jaquelene/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { campaignTable } from "#backend/campaign/schema";
import { sqliteWhitespaceCharacters } from "#backend/database/sqlite-text";
import type { CampaignId, InstructionId } from "#backend/id";

const titleMaxLengthSql = sql.raw(String(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH));
const bodyMaxLengthSql = sql.raw(String(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH));

export const roleplayInstructionTable = sqliteTable(
  "roleplay_instructions",
  {
    id: text().$type<InstructionId>().notNull(),
    title: text().$type<RoleplayInstructionTitle>().notNull(),
    body: text().$type<RoleplayInstructionBody>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (instruction) => [
    primaryKey({ columns: [instruction.id] }),
    check(
      "roleplay_instructions_title_valid",
      sql`${instruction.title} = trim(${instruction.title}, ${sqliteWhitespaceCharacters}) AND length(${instruction.title}) > 0 AND length(${instruction.title}) <= ${titleMaxLengthSql}`,
    ),
    check(
      "roleplay_instructions_body_valid",
      sql`length(trim(${instruction.body}, ${sqliteWhitespaceCharacters})) > 0 AND length(${instruction.body}) <= ${bodyMaxLengthSql}`,
    ),
    check("roleplay_instructions_created_at_nonnegative", sql`${instruction.createdAt} >= 0`),
  ],
);

export const campaignRoleplayInstructionTable = sqliteTable(
  "campaign_roleplay_instructions",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    instructionId: text("instruction_id")
      .$type<InstructionId>()
      .notNull()
      .references(() => roleplayInstructionTable.id, { onDelete: "cascade" }),
  },
  (selection) => [
    primaryKey({ columns: [selection.campaignId] }),
    index("campaign_roleplay_instructions_instruction_index").on(selection.instructionId),
  ],
);
