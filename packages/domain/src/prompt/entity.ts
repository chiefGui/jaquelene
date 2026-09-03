import * as z from "zod/mini";
import { promptBodySchema, promptTitleSchema } from "./content";
import { promptKeySchema, promptKindKeySchema } from "./identity";

export const PromptOrigin = Object.freeze({
  BuiltIn: "built-in",
  Custom: "custom",
} as const);

const promptShape = {
  key: promptKeySchema,
  kind: promptKindKeySchema,
  title: promptTitleSchema,
  body: promptBodySchema,
};

const builtInPromptSchema = z.strictObject({
  ...promptShape,
  origin: z.literal(PromptOrigin.BuiltIn),
});

const timestampSchema = z.number().check(z.int(), z.nonnegative());

export const customPromptSchema = z
  .strictObject({
    ...promptShape,
    origin: z.literal(PromptOrigin.Custom),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .check(z.refine(({ createdAt, updatedAt }) => updatedAt >= createdAt));

export const promptSchema = z.discriminatedUnion("origin", [
  builtInPromptSchema,
  customPromptSchema,
]);

export type BuiltInPrompt = z.output<typeof builtInPromptSchema>;
export type CustomPrompt = z.output<typeof customPromptSchema>;
export type Prompt = BuiltInPrompt | CustomPrompt;

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

export function parseCustomPrompt(value: unknown) {
  return parseEntity(customPromptSchema, value, "Custom prompt is invalid");
}

export function parsePrompt(value: unknown): Prompt {
  return parseEntity(promptSchema, value, "Prompt is invalid");
}
