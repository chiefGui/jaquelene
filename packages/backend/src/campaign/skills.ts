import { type SkillKey, type SkillKindKey } from "@jaquelene/domain";
import { and, eq } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import type { CampaignId } from "#backend/id";
import {
  skillDefaultOverrideTable,
  skillKindFallbackTable,
  skillTable,
} from "#backend/skill/schema";
import type { SkillCatalog } from "#backend/skill/types";
import { campaignSkillSelectionTable, campaignTable } from "./schema";

type DatabaseReader = Pick<Database, "select">;

export type CampaignSkillSelection = Readonly<{
  campaignId: CampaignId;
  kind: SkillKindKey;
  selectedSkillKey?: SkillKey;
  effectiveSkillKey: SkillKey | null;
  source: "campaign" | "default" | "fallback" | "none";
}>;

export type SetCampaignSkillSelectionInput = Readonly<{
  campaignId: CampaignId;
  kind: SkillKindKey;
  skillKey?: SkillKey;
}>;

function requireSkillForKind(database: DatabaseReader, kind: SkillKindKey, skillKey: SkillKey) {
  const skill = database
    .select({ key: skillTable.key })
    .from(skillTable)
    .where(and(eq(skillTable.kind, kind), eq(skillTable.key, skillKey)))
    .get();

  if (!skill) {
    throw new RangeError(`Skill "${skillKey}" does not exist for kind "${kind}".`);
  }
}

function readCampaignSelection(
  database: DatabaseReader,
  campaignId: CampaignId,
  kind: SkillKindKey,
): CampaignSkillSelection | null {
  const selection = database
    .select({
      campaignId: campaignTable.id,
      selectedSkillKey: campaignSkillSelectionTable.skillKey,
      defaultSkillKey: skillDefaultOverrideTable.skillKey,
      fallbackSkillKey: skillKindFallbackTable.skillKey,
    })
    .from(campaignTable)
    .leftJoin(
      campaignSkillSelectionTable,
      and(
        eq(campaignSkillSelectionTable.campaignId, campaignTable.id),
        eq(campaignSkillSelectionTable.kind, kind),
      ),
    )
    .leftJoin(skillDefaultOverrideTable, eq(skillDefaultOverrideTable.kind, kind))
    .leftJoin(skillKindFallbackTable, eq(skillKindFallbackTable.kind, kind))
    .where(eq(campaignTable.id, campaignId))
    .get();

  if (!selection) {
    return null;
  }

  if (selection.selectedSkillKey) {
    return {
      campaignId,
      kind,
      selectedSkillKey: selection.selectedSkillKey,
      effectiveSkillKey: selection.selectedSkillKey,
      source: "campaign",
    };
  }

  if (selection.defaultSkillKey) {
    return {
      campaignId,
      kind,
      effectiveSkillKey: selection.defaultSkillKey,
      source: "default",
    };
  }

  if (selection.fallbackSkillKey) {
    return {
      campaignId,
      kind,
      effectiveSkillKey: selection.fallbackSkillKey,
      source: "fallback",
    };
  }

  return { campaignId, kind, effectiveSkillKey: null, source: "none" };
}

export function createCampaignSkills(
  database: Database,
  skills: Pick<SkillCatalog, "get" | "getKind">,
) {
  function requireKind(kind: SkillKindKey) {
    if (!skills.getKind(kind)) {
      throw new RangeError(`Skill kind "${kind}" does not exist.`);
    }
  }

  return {
    getSelection(campaignId: CampaignId, kind: SkillKindKey) {
      requireKind(kind);
      return readCampaignSelection(database, campaignId, kind);
    },

    setSelection({ campaignId, kind, skillKey }: SetCampaignSkillSelectionInput) {
      return database.transaction((transaction) => {
        const campaign = transaction
          .select({ id: campaignTable.id })
          .from(campaignTable)
          .where(eq(campaignTable.id, campaignId))
          .get();

        if (!campaign) {
          return null;
        }

        requireKind(kind);

        if (skillKey === undefined) {
          transaction
            .delete(campaignSkillSelectionTable)
            .where(
              and(
                eq(campaignSkillSelectionTable.campaignId, campaignId),
                eq(campaignSkillSelectionTable.kind, kind),
              ),
            )
            .run();
        } else {
          requireSkillForKind(transaction, kind, skillKey);
          transaction
            .insert(campaignSkillSelectionTable)
            .values({ campaignId, kind, skillKey })
            .onConflictDoUpdate({
              target: [campaignSkillSelectionTable.campaignId, campaignSkillSelectionTable.kind],
              set: { skillKey },
            })
            .run();
        }

        return readCampaignSelection(transaction, campaignId, kind);
      });
    },

    resolve(campaignId: CampaignId, kind: SkillKindKey) {
      requireKind(kind);
      const selection = readCampaignSelection(database, campaignId, kind);

      if (!selection?.effectiveSkillKey) {
        return null;
      }

      const skill = skills.get(selection.effectiveSkillKey);

      if (!skill || skill.kind !== kind) {
        throw new Error(
          `Campaign "${campaignId}" resolves unavailable skill "${selection.effectiveSkillKey}".`,
        );
      }

      return skill;
    },
  };
}

export type CampaignSkillEngine = ReturnType<typeof createCampaignSkills>;
export type CampaignSkills = Pick<CampaignSkillEngine, "getSelection" | "setSelection">;
