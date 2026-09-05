import * as z from "zod/mini";
import { promptSchema } from "../prompt/content";
import { skillKindKeySchema } from "./identity";

export const SKILL_TITLE_MAX_LENGTH = 120;
export const SKILL_TITLE_MAX_UTF16_LENGTH = SKILL_TITLE_MAX_LENGTH * 2;

export const skillTitleSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(SKILL_TITLE_MAX_LENGTH))
  .brand<"SkillTitle">();

const skillContentShape = {
  title: skillTitleSchema,
  prompt: promptSchema,
};

const skillContentSchema = z.strictObject(skillContentShape);

export const createSkillInputSchema = z.strictObject({
  kind: skillKindKeySchema,
  ...skillContentShape,
});

export const updateSkillInputSchema = skillContentSchema;

export type SkillTitle = z.output<typeof skillTitleSchema>;
export type CreateSkillInput = z.input<typeof createSkillInputSchema>;
export type UpdateSkillInput = z.input<typeof updateSkillInputSchema>;

function parseWithSchema<Output>(
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

export function parseCreateSkillInput(value: unknown) {
  return parseWithSchema(createSkillInputSchema, value, "Skill creation input is invalid.");
}

export function parseSkillContent(value: unknown) {
  return parseWithSchema(skillContentSchema, value, "Skill content is invalid.");
}

export function parseUpdateSkillInput(value: unknown) {
  return parseWithSchema(updateSkillInputSchema, value, "Skill update input is invalid.");
}
