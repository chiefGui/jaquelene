import type { FormStore } from "@ariakit/react/form";
import {
  SCENARIO_TITLE_MAX_LENGTH,
  createScenarioInputSchema,
  type CreateScenarioInput,
  scenarioTitleInputSchema,
  type ScenarioTitleInput,
} from "@jaquelene/domain";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatScenarioInputIssue(issue: FormValidationIssue) {
  if (issue.path.at(-1) !== "title") {
    return issue.message;
  }

  return issue.code === "too_big"
    ? `Use ${SCENARIO_TITLE_MAX_LENGTH} characters or fewer.`
    : "Enter a scenario title.";
}

export function useCreateScenarioFormValidation(form: FormStore<CreateScenarioInput>) {
  useZodFormValidation(form, createScenarioInputSchema, formatScenarioInputIssue);
}

export function useScenarioTitleFormValidation(form: FormStore<ScenarioTitleInput>) {
  useZodFormValidation(form, scenarioTitleInputSchema, formatScenarioInputIssue);
}
