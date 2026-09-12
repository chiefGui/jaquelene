import * as z from "zod/mini";

export const skillIdSchema = z
  .string()
  .check(z.regex(/^[a-z][a-z0-9.-]*$/), z.maxLength(128))
  .brand<"SkillId">();
export type SkillId = z.output<typeof skillIdSchema>;

export const skillDescriptorSchema = z.readonly(
  z.object({
    id: skillIdSchema,
    name: z.string().check(z.minLength(1), z.maxLength(80)),
    pendingLabel: z.string().check(z.minLength(1), z.maxLength(160)),
  }),
);
export type SkillDescriptor = z.output<typeof skillDescriptorSchema>;
