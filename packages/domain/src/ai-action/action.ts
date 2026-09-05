import * as z from "zod/mini";

export const AI_ACTION_TEXT_MAX_UTF16_LENGTH = 40_000;

export const aiActionIdentitySchema = z.string().check(
  z.minLength(1),
  z.maxLength(120),
  z.refine((value) => value.trim() === value),
);
export type AiActionIdentity = z.output<typeof aiActionIdentitySchema>;

export const aiActionDescriptorSchema = z.strictObject({
  id: aiActionIdentitySchema,
  label: aiActionIdentitySchema,
  requiresText: z.boolean(),
});
export type AiActionDescriptor = Readonly<z.output<typeof aiActionDescriptorSchema>>;

export const aiActionInputSchema = z.strictObject({
  executionId: aiActionIdentitySchema,
  target: aiActionIdentitySchema,
  actionId: aiActionIdentitySchema,
  text: z.string().check(z.maxLength(AI_ACTION_TEXT_MAX_UTF16_LENGTH)),
});
export type AiActionInput = z.output<typeof aiActionInputSchema>;

export const aiActionTextResultSchema = z.string().check(
  z.minLength(1),
  z.maxLength(AI_ACTION_TEXT_MAX_UTF16_LENGTH),
  z.refine((text) => text.trim().length > 0),
);
export const aiActionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("completed"), text: aiActionTextResultSchema }),
  z.strictObject({ status: z.literal("failed"), message: z.string().check(z.minLength(1)) }),
  z.strictObject({ status: z.literal("cancelled") }),
]);
export type AiActionResult = z.output<typeof aiActionResultSchema>;
