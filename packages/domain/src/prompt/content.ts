import * as z from "zod/mini";

export const PROMPT_MAX_LENGTH = 20_000;
export const PROMPT_MAX_UTF16_LENGTH = PROMPT_MAX_LENGTH * 2;

export const promptSchema = z
  .string()
  .check(
    z.maxLength(PROMPT_MAX_LENGTH),
    z.refine((prompt) => prompt.trim().length > 0),
  )
  .brand<"Prompt">();

export type Prompt = z.output<typeof promptSchema>;
