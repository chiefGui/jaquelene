import * as z from "zod/mini";
import { promptKindKeySchema } from "./identity";

export const PROMPT_TITLE_MAX_LENGTH = 120;
export const PROMPT_TITLE_MAX_UTF16_LENGTH = PROMPT_TITLE_MAX_LENGTH * 2;
export const PROMPT_BODY_MAX_LENGTH = 20_000;
export const PROMPT_BODY_MAX_UTF16_LENGTH = PROMPT_BODY_MAX_LENGTH * 2;

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

const promptContentShape = {
  title: promptTitleSchema,
  body: promptBodySchema,
};

const promptContentSchema = z.strictObject(promptContentShape);

export const createPromptInputSchema = z.strictObject({
  kind: promptKindKeySchema,
  ...promptContentShape,
});

export const updatePromptInputSchema = promptContentSchema;

export type PromptTitle = z.output<typeof promptTitleSchema>;
export type PromptBody = z.output<typeof promptBodySchema>;
export type CreatePromptInput = z.input<typeof createPromptInputSchema>;
export type UpdatePromptInput = z.input<typeof updatePromptInputSchema>;

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

export function parseCreatePromptInput(value: unknown) {
  return parseWithSchema(createPromptInputSchema, value, "Prompt creation input is invalid.");
}

export function parsePromptContent(value: unknown) {
  return parseWithSchema(promptContentSchema, value, "Prompt content is invalid.");
}

export function parseUpdatePromptInput(value: unknown) {
  return parseWithSchema(updatePromptInputSchema, value, "Prompt update input is invalid.");
}
