import * as z from "zod/mini";

export const REGENERATION_INSTRUCTIONS_MAX_LENGTH = 2_000;

// Count UTF-16 code units consistently with the renderer and IPC transport.
export const regenerationInstructionsSchema = z.string().check(
  z.refine((value) => value.length <= REGENERATION_INSTRUCTIONS_MAX_LENGTH, {
    message: `Use ${REGENERATION_INSTRUCTIONS_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
  }),
);

export type RegenerationInstructions = z.output<typeof regenerationInstructionsSchema>;

export function parseRegenerationInstructions(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = regenerationInstructionsSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError(
      `Regeneration instructions must contain at most ${REGENERATION_INSTRUCTIONS_MAX_LENGTH.toLocaleString("en-US")} characters.`,
      {
        cause: result.error,
      },
    );
  }

  const instructions = result.data.trim();
  if (instructions.length === 0) {
    return undefined;
  }

  return instructions;
}
