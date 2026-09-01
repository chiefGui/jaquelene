import * as z from "zod/mini";

export const SCENARIO_TITLE_MAX_LENGTH = 120;

// A 120-code-point title can occupy at most 240 UTF-16 code units. This is the
// safety bound for DOM and transport adapters, which count string length
// differently from Zod and SQLite.
export const SCENARIO_TITLE_MAX_UTF16_LENGTH = SCENARIO_TITLE_MAX_LENGTH * 2;

export const scenarioTitleSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(SCENARIO_TITLE_MAX_LENGTH))
  .brand<"ScenarioTitle">();

const scenarioTitleInputShape = {
  title: scenarioTitleSchema,
};

export const scenarioTitleInputSchema = z.strictObject(scenarioTitleInputShape);
export const createScenarioInputSchema = z.strictObject(scenarioTitleInputShape);

export type ScenarioTitle = z.output<typeof scenarioTitleSchema>;
export type ScenarioTitleInput = z.input<typeof scenarioTitleInputSchema>;
export type CreateScenarioInput = z.input<typeof createScenarioInputSchema>;
export type ScenarioTitleErrorReason = "empty" | "invalid-type" | "too-long";

export class InvalidScenarioTitleError extends TypeError {
  override readonly name = "InvalidScenarioTitleError";

  constructor(readonly reason: ScenarioTitleErrorReason) {
    const message =
      reason === "empty"
        ? "Scenario title must contain text."
        : reason === "too-long"
          ? `Scenario title cannot exceed ${SCENARIO_TITLE_MAX_LENGTH} characters.`
          : "Scenario title must be text.";

    super(message);
  }
}

function scenarioTitleError(issue: z.core.$ZodIssue | undefined) {
  if (issue?.code === "invalid_type") {
    return new InvalidScenarioTitleError("invalid-type");
  }

  if (issue?.code === "too_big") {
    return new InvalidScenarioTitleError("too-long");
  }

  return new InvalidScenarioTitleError("empty");
}

export function parseScenarioTitle(value: unknown): ScenarioTitle {
  const result = scenarioTitleSchema.safeParse(value);

  if (!result.success) {
    throw scenarioTitleError(result.error.issues[0]);
  }

  return result.data;
}

export function parseCreateScenarioInput(value: unknown) {
  const result = createScenarioInputSchema.safeParse(value);

  if (!result.success) {
    const titleIssue = result.error.issues.find((issue) => issue.path.at(-1) === "title");

    if (!titleIssue) {
      throw new TypeError("Scenario input is invalid.");
    }

    throw scenarioTitleError(titleIssue);
  }

  return result.data;
}
