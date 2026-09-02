import * as z from "zod/mini";

export const ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH = 120;
export const ROLEPLAY_INSTRUCTION_TITLE_MAX_UTF16_LENGTH =
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH * 2;
export const ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH = 20_000;
export const ROLEPLAY_INSTRUCTION_BODY_MAX_UTF16_LENGTH = ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH * 2;

export const roleplayInstructionTitleSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH))
  .brand<"RoleplayInstructionTitle">();

export const roleplayInstructionBodySchema = z
  .string()
  .check(
    z.maxLength(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH),
    z.refine((body) => body.trim().length > 0),
  )
  .brand<"RoleplayInstructionBody">();

export const roleplayInstructionInputSchema = z.strictObject({
  title: roleplayInstructionTitleSchema,
  body: roleplayInstructionBodySchema,
});

export type RoleplayInstructionTitle = z.output<typeof roleplayInstructionTitleSchema>;
export type RoleplayInstructionBody = z.output<typeof roleplayInstructionBodySchema>;
export type RoleplayInstructionInput = z.input<typeof roleplayInstructionInputSchema>;

export type CampaignRoleplayInstructionPreference<Key extends string = string> = Readonly<{
  instructionKey: Key | null;
}>;

export function composeCampaignRoleplayInstructionKey<Key extends string>(
  factoryInstructionKey: Key,
  defaultInstructionKey: Key,
  preference: CampaignRoleplayInstructionPreference<Key> | undefined,
): Key {
  if (!preference) {
    return defaultInstructionKey;
  }

  return preference.instructionKey ?? factoryInstructionKey;
}

export function setCampaignRoleplayInstructionPreference<Key extends string>(
  factoryInstructionKey: Key,
  defaultInstructionKey: Key,
  instructionKey: Key,
): CampaignRoleplayInstructionPreference<Key> | undefined {
  if (instructionKey === defaultInstructionKey) {
    return undefined;
  }

  return {
    instructionKey: instructionKey === factoryInstructionKey ? null : instructionKey,
  };
}

export function parseRoleplayInstructionInput(value: unknown) {
  const result = roleplayInstructionInputSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("Roleplay instruction input is invalid.", { cause: result.error });
  }

  return result.data;
}
