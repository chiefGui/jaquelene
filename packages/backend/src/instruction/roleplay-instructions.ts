import {
  composeCampaignRoleplayInstructionKey,
  parseRoleplayInstructionInput,
  setCampaignRoleplayInstructionPreference,
  type CampaignRoleplayInstructionPreference,
  type RoleplayInstructionInput,
} from "@jaquelene/domain";
import { asc, eq } from "drizzle-orm";
import { campaignTable } from "#backend/campaign/schema";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type InstructionId } from "#backend/id";
import { jaqueleneRoleplayInstruction, roleplayInstructionGroup } from "./factory/roleplay";
import type {
  CatalogInstruction,
  InstructionContext,
  InstructionGroup,
  InstructionSource,
} from "./registry";
import {
  campaignRoleplayInstructionTable,
  roleplayInstructionPreferenceSlot,
  roleplayInstructionPreferenceTable,
  roleplayInstructionTable,
} from "./schema";

export type RoleplayInstructionDeletion = Readonly<{
  defaultInstructionKey: string;
}>;

export type RoleplayInstructionManagement = Readonly<{
  create: (input: RoleplayInstructionInput) => CatalogInstruction;
  update: (id: InstructionId, input: RoleplayInstructionInput) => CatalogInstruction | null;
  delete: (id: InstructionId) => RoleplayInstructionDeletion | null;
  getDefaultSelection: () => string;
  setDefaultSelection: (instructionKey: string) => string;
  getCampaignSelection: (campaignId: CampaignId) => string | null;
  setCampaignSelection: (campaignId: CampaignId, instructionKey: string) => string | null;
}>;

type RoleplayInstructionSource = InstructionSource & RoleplayInstructionManagement;

function toCatalogInstruction(
  instruction: typeof roleplayInstructionTable.$inferSelect,
): CatalogInstruction {
  return {
    key: instruction.id,
    title: instruction.title,
    body: instruction.body,
    origin: "custom",
  };
}

export function createRoleplayInstructions(database: Database, now: () => number = Date.now) {
  function listCustomInstructions() {
    return database
      .select()
      .from(roleplayInstructionTable)
      .orderBy(asc(roleplayInstructionTable.createdAt), asc(roleplayInstructionTable.id))
      .all()
      .map(toCatalogInstruction);
  }

  function getDefaultSelection() {
    const preference = database
      .select({ instructionId: roleplayInstructionPreferenceTable.defaultInstructionId })
      .from(roleplayInstructionPreferenceTable)
      .where(eq(roleplayInstructionPreferenceTable.slot, roleplayInstructionPreferenceSlot))
      .get();
    return preference?.instructionId ?? jaqueleneRoleplayInstruction.key;
  }

  function getCampaignSelection(campaignId: CampaignId) {
    const selection = database
      .select({
        campaignId: campaignTable.id,
        preferenceCampaignId: campaignRoleplayInstructionTable.campaignId,
        preferenceInstructionId: campaignRoleplayInstructionTable.instructionId,
        defaultInstructionId: roleplayInstructionPreferenceTable.defaultInstructionId,
      })
      .from(campaignTable)
      .leftJoin(
        campaignRoleplayInstructionTable,
        eq(campaignRoleplayInstructionTable.campaignId, campaignTable.id),
      )
      .leftJoin(
        roleplayInstructionPreferenceTable,
        eq(roleplayInstructionPreferenceTable.slot, roleplayInstructionPreferenceSlot),
      )
      .where(eq(campaignTable.id, campaignId))
      .get();

    if (!selection) {
      return null;
    }

    const preference: CampaignRoleplayInstructionPreference | undefined =
      selection.preferenceCampaignId === null
        ? undefined
        : { instructionKey: selection.preferenceInstructionId };
    const defaultInstructionKey =
      selection.defaultInstructionId ?? jaqueleneRoleplayInstruction.key;
    return composeCampaignRoleplayInstructionKey(
      jaqueleneRoleplayInstruction.key,
      defaultInstructionKey,
      preference,
    );
  }

  const instructions = {
    listGroups(): readonly InstructionGroup[] {
      return [
        {
          ...roleplayInstructionGroup,
          instructions: [jaqueleneRoleplayInstruction, ...listCustomInstructions()],
        },
      ];
    },

    resolve({ campaign }: InstructionContext) {
      if (!campaign) {
        return [];
      }

      const instructionKey = getCampaignSelection(campaign.id);

      if (!instructionKey) {
        throw new Error(`Campaign "${campaign.id}" has no instruction selection.`);
      }

      if (instructionKey === jaqueleneRoleplayInstruction.key) {
        return [jaqueleneRoleplayInstruction];
      }

      const selected = database
        .select()
        .from(roleplayInstructionTable)
        .where(eq(roleplayInstructionTable.id, ids.instruction.parse(instructionKey)))
        .get();

      if (!selected) {
        throw new Error(`Roleplay instruction "${instructionKey}" does not exist.`);
      }

      return [toCatalogInstruction(selected)];
    },

    create(input: RoleplayInstructionInput) {
      const { title, body } = parseRoleplayInstructionInput(input);
      const instruction = {
        id: ids.instruction.create(),
        title,
        body,
        createdAt: now(),
      };
      database.insert(roleplayInstructionTable).values(instruction).run();
      return toCatalogInstruction(instruction);
    },

    update(id: InstructionId, input: RoleplayInstructionInput) {
      const { title, body } = parseRoleplayInstructionInput(input);
      const instruction = database
        .update(roleplayInstructionTable)
        .set({ title, body })
        .where(eq(roleplayInstructionTable.id, id))
        .returning()
        .get();
      return instruction ? toCatalogInstruction(instruction) : null;
    },

    delete(id: InstructionId) {
      const deleted = database
        .delete(roleplayInstructionTable)
        .where(eq(roleplayInstructionTable.id, id))
        .returning({ id: roleplayInstructionTable.id })
        .get();

      return deleted ? { defaultInstructionKey: getDefaultSelection() } : null;
    },

    getDefaultSelection,

    setDefaultSelection(instructionKey: string) {
      if (instructionKey === jaqueleneRoleplayInstruction.key) {
        database
          .delete(roleplayInstructionPreferenceTable)
          .where(eq(roleplayInstructionPreferenceTable.slot, roleplayInstructionPreferenceSlot))
          .run();
        return jaqueleneRoleplayInstruction.key;
      }

      const instructionId = ids.instruction.parse(instructionKey);
      const instruction = database
        .select({ id: roleplayInstructionTable.id })
        .from(roleplayInstructionTable)
        .where(eq(roleplayInstructionTable.id, instructionId))
        .get();

      if (!instruction) {
        throw new RangeError(`Roleplay instruction "${instructionId}" does not exist.`);
      }

      database
        .insert(roleplayInstructionPreferenceTable)
        .values({
          slot: roleplayInstructionPreferenceSlot,
          defaultInstructionId: instructionId,
        })
        .onConflictDoUpdate({
          target: roleplayInstructionPreferenceTable.slot,
          set: { defaultInstructionId: instructionId },
        })
        .run();
      return instructionId;
    },

    getCampaignSelection,

    setCampaignSelection(campaignId: CampaignId, instructionKey: string) {
      return database.transaction((transaction) => {
        const campaign = transaction
          .select({ id: campaignTable.id })
          .from(campaignTable)
          .where(eq(campaignTable.id, campaignId))
          .get();

        if (!campaign) {
          return null;
        }

        const defaultPreference = transaction
          .select({ instructionId: roleplayInstructionPreferenceTable.defaultInstructionId })
          .from(roleplayInstructionPreferenceTable)
          .where(eq(roleplayInstructionPreferenceTable.slot, roleplayInstructionPreferenceSlot))
          .get();
        const defaultInstructionKey =
          defaultPreference?.instructionId ?? jaqueleneRoleplayInstruction.key;
        const preference = setCampaignRoleplayInstructionPreference(
          jaqueleneRoleplayInstruction.key,
          defaultInstructionKey,
          instructionKey,
        );

        if (!preference) {
          transaction
            .delete(campaignRoleplayInstructionTable)
            .where(eq(campaignRoleplayInstructionTable.campaignId, campaignId))
            .run();
          return instructionKey;
        }

        let instructionId: InstructionId | null = null;

        if (preference.instructionKey !== null) {
          instructionId = ids.instruction.parse(preference.instructionKey);
          const instruction = transaction
            .select({ id: roleplayInstructionTable.id })
            .from(roleplayInstructionTable)
            .where(eq(roleplayInstructionTable.id, instructionId))
            .get();

          if (!instruction) {
            throw new RangeError(`Roleplay instruction "${instructionId}" does not exist.`);
          }
        }

        transaction
          .insert(campaignRoleplayInstructionTable)
          .values({ campaignId, instructionId })
          .onConflictDoUpdate({
            target: campaignRoleplayInstructionTable.campaignId,
            set: { instructionId },
          })
          .run();
        return instructionKey;
      });
    },
  };

  instructions satisfies RoleplayInstructionSource;
  return instructions;
}
