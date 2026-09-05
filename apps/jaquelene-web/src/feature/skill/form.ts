import type { FormStore } from "@ariakit/react/form";
import {
  PROMPT_MAX_LENGTH,
  SKILL_TITLE_MAX_LENGTH,
  updateSkillInputSchema,
  type UpdateSkillInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatSkillIssue(issue: FormValidationIssue) {
  const field = issue.path.at(-1);

  if (field === "title") {
    return issue.code === "too_big"
      ? `Use ${formatCount(SKILL_TITLE_MAX_LENGTH)} characters or fewer`
      : "Enter a title";
  }

  if (field === "prompt") {
    return issue.code === "too_big"
      ? `Use ${formatCount(PROMPT_MAX_LENGTH)} characters or fewer`
      : "Enter prompt text";
  }

  return issue.message;
}

export function useSkillFormValidation(form: FormStore<UpdateSkillInput>) {
  useZodFormValidation(form, updateSkillInputSchema, formatSkillIssue);
}
