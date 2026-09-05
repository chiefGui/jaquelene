import * as z from "zod/mini";

export const SKILL_KEY_MAX_LENGTH = 128;
export const SKILL_KIND_KEY_MAX_LENGTH = 64;

export const skillKeySchema = z
  .string()
  .check(z.minLength(1), z.maxLength(SKILL_KEY_MAX_LENGTH))
  .brand<"SkillKey">();

export const skillKindKeySchema = z
  .string()
  .check(z.regex(/^[a-z][a-z0-9-]*$/), z.maxLength(SKILL_KIND_KEY_MAX_LENGTH))
  .brand<"SkillKindKey">();

export type SkillKey = z.output<typeof skillKeySchema>;
export type SkillKindKey = z.output<typeof skillKindKeySchema>;

function parseSkillIdentity<Output>(
  schema: z.core.$ZodType<Output>,
  value: unknown,
  message: string,
): Output {
  const result = z.safeParse(schema, value);

  if (!result.success) {
    throw new TypeError(message, { cause: result.error });
  }

  return result.data;
}

export function parseSkillKey(value: unknown) {
  return parseSkillIdentity(skillKeySchema, value, "Skill key is invalid.");
}

export function parseSkillKindKey(value: unknown) {
  return parseSkillIdentity(skillKindKeySchema, value, "Skill kind key is invalid.");
}
