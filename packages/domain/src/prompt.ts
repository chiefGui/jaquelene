import * as z from "zod/mini";

export const PROMPT_TITLE_MAX_LENGTH = 120;
export const PROMPT_TITLE_MAX_UTF16_LENGTH = PROMPT_TITLE_MAX_LENGTH * 2;
export const PROMPT_BODY_MAX_LENGTH = 20_000;
export const PROMPT_BODY_MAX_UTF16_LENGTH = PROMPT_BODY_MAX_LENGTH * 2;
export const PROMPT_KEY_MAX_LENGTH = 128;

export const promptKeySchema = z
  .string()
  .check(z.minLength(1), z.maxLength(PROMPT_KEY_MAX_LENGTH))
  .brand<"PromptKey">();

export const promptKindKeySchema = z
  .string()
  .check(z.regex(/^[a-z][a-z0-9-]*$/), z.maxLength(64))
  .brand<"PromptKindKey">();

export const promptTitleSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(PROMPT_TITLE_MAX_LENGTH))
  .brand<"PromptTitle">();

export const promptBodySchema = z
  .string()
  .check(
    z.maxLength(PROMPT_BODY_MAX_LENGTH),
    z.refine((body) => body.trim().length > 0),
  )
  .brand<"PromptBody">();

export const createPromptInputSchema = z.strictObject({
  kind: promptKindKeySchema,
  title: promptTitleSchema,
  body: promptBodySchema,
});

export const updatePromptInputSchema = z.strictObject({
  title: promptTitleSchema,
  body: promptBodySchema,
});

export type PromptKindKey = z.output<typeof promptKindKeySchema>;
export type PromptKey = z.output<typeof promptKeySchema>;
export type PromptTitle = z.output<typeof promptTitleSchema>;
export type PromptBody = z.output<typeof promptBodySchema>;
export type CreatePromptInput = z.input<typeof createPromptInputSchema>;
export type UpdatePromptInput = z.input<typeof updatePromptInputSchema>;

function parsePromptInput<Output>(
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

export function parseCreatePromptInput(value: unknown) {
  return parsePromptInput(createPromptInputSchema, value, "Prompt creation input is invalid.");
}

export function parsePromptKey(value: unknown) {
  return parsePromptInput(promptKeySchema, value, "Prompt key is invalid.");
}

export function parseUpdatePromptInput(value: unknown) {
  return parsePromptInput(updatePromptInputSchema, value, "Prompt update input is invalid.");
}
