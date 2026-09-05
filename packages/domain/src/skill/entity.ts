import * as z from "zod/mini";
import { promptSchema } from "../prompt/content";
import { skillTitleSchema } from "./content";
import { skillKeySchema, skillKindKeySchema } from "./identity";

export const SkillOrigin = Object.freeze({
  BuiltIn: "built-in",
  Custom: "custom",
} as const);

const skillShape = {
  key: skillKeySchema,
  kind: skillKindKeySchema,
  title: skillTitleSchema,
  prompt: promptSchema,
};

const builtInSkillSchema = z.strictObject({
  ...skillShape,
  origin: z.literal(SkillOrigin.BuiltIn),
});

const timestampSchema = z.number().check(z.int(), z.nonnegative());

export const customSkillSchema = z
  .strictObject({
    ...skillShape,
    origin: z.literal(SkillOrigin.Custom),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .check(z.refine(({ createdAt, updatedAt }) => updatedAt >= createdAt));

export const skillSchema = z.discriminatedUnion("origin", [builtInSkillSchema, customSkillSchema]);

export type BuiltInSkill = z.output<typeof builtInSkillSchema>;
export type CustomSkill = z.output<typeof customSkillSchema>;
export type Skill = BuiltInSkill | CustomSkill;

function parseEntity<Output>(
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

export function parseCustomSkill(value: unknown) {
  return parseEntity(customSkillSchema, value, "Custom skill is invalid");
}

export function parseSkill(value: unknown): Skill {
  return parseEntity(skillSchema, value, "Skill is invalid");
}
