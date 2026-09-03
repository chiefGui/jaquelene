import * as z from "zod/mini";

export const PROMPT_KEY_MAX_LENGTH = 128;
export const PROMPT_KIND_KEY_MAX_LENGTH = 64;

export const promptKeySchema = z
  .string()
  .check(z.minLength(1), z.maxLength(PROMPT_KEY_MAX_LENGTH))
  .brand<"PromptKey">();

export const promptKindKeySchema = z
  .string()
  .check(z.regex(/^[a-z][a-z0-9-]*$/), z.maxLength(PROMPT_KIND_KEY_MAX_LENGTH))
  .brand<"PromptKindKey">();

export type PromptKey = z.output<typeof promptKeySchema>;
export type PromptKindKey = z.output<typeof promptKindKeySchema>;

function parsePromptIdentity<Output>(
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

export function parsePromptKey(value: unknown) {
  return parsePromptIdentity(promptKeySchema, value, "Prompt key is invalid.");
}

export function parsePromptKindKey(value: unknown) {
  return parsePromptIdentity(promptKindKeySchema, value, "Prompt kind key is invalid.");
}
