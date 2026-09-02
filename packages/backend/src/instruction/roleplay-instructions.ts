import { parseRoleplayInstructionInput, type RoleplayInstructionInput } from "@jaquelene/domain";
import { asc, eq } from "drizzle-orm";
import { campaignTable } from "#backend/campaign/schema";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type InstructionId } from "#backend/id";
import { defaultRoleplayInstruction, roleplayInstructionGroup } from "./factory/roleplay";
import type {
  CatalogInstruction,
  InstructionContext,
  InstructionGroup,
  InstructionSource,
} from "./registry";
import { campaignRoleplayInstructionTable, roleplayInstructionTable } from "./schema";

export type RoleplayInstructionManagement = Readonly<{
  create: (input: RoleplayInstructionInput) => CatalogInstruction;
  update: (id: InstructionId, input: RoleplayInstructionInput) => CatalogInstruction | null;
  delete: (id: InstructionId) => boolean;
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

  function getCampaignSelection(campaignId: CampaignId) {
    const selection = database
      .select({
        campaignId: campaignTable.id,
        instructionId: campaignRoleplayInstructionTable.instructionId,
      })
      .from(campaignTable)
      .leftJoin(
        campaignRoleplayInstructionTable,
        eq(campaignRoleplayInstructionTable.campaignId, campaignTable.id),
      )
      .where(eq(campaignTable.id, campaignId))
      .get();

    if (!selection) {
      return null;
    }

    return selection.instructionId ?? defaultRoleplayInstruction.key;
  }

  const instructions = {
    listGroups(): readonly InstructionGroup[] {
      return [
        {
          ...roleplayInstructionGroup,
          instructions: [defaultRoleplayInstruction, ...listCustomInstructions()],
        },
      ];
    },

    resolve({ campaign }: InstructionContext) {
      if (!campaign) {
        return [];
      }

      const selected = database
        .select({
          id: roleplayInstructionTable.id,
          title: roleplayInstructionTable.title,
          body: roleplayInstructionTable.body,
          createdAt: roleplayInstructionTable.createdAt,
        })
        .from(campaignRoleplayInstructionTable)
        .innerJoin(
          roleplayInstructionTable,
          eq(roleplayInstructionTable.id, campaignRoleplayInstructionTable.instructionId),
        )
        .where(eq(campaignRoleplayInstructionTable.campaignId, campaign.id))
        .get();

      return [selected ? toCatalogInstruction(selected) : defaultRoleplayInstruction];
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
      return Boolean(
        database
          .delete(roleplayInstructionTable)
          .where(eq(roleplayInstructionTable.id, id))
          .returning({ id: roleplayInstructionTable.id })
          .get(),
      );
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

        if (instructionKey === defaultRoleplayInstruction.key) {
          transaction
            .delete(campaignRoleplayInstructionTable)
            .where(eq(campaignRoleplayInstructionTable.campaignId, campaignId))
            .run();
          return defaultRoleplayInstruction.key;
        }

        const instructionId = ids.instruction.parse(instructionKey);
        const instruction = transaction
          .select({ id: roleplayInstructionTable.id })
          .from(roleplayInstructionTable)
          .where(eq(roleplayInstructionTable.id, instructionId))
          .get();

        if (!instruction) {
          throw new RangeError(`Roleplay instruction "${instructionId}" does not exist.`);
        }

        transaction
          .insert(campaignRoleplayInstructionTable)
          .values({ campaignId, instructionId })
          .onConflictDoUpdate({
            target: campaignRoleplayInstructionTable.campaignId,
            set: { instructionId },
          })
          .run();
        return instructionId;
      });
    },
  };

  instructions satisfies RoleplayInstructionSource;
  return instructions;
}
