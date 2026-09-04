import type { FormStore } from "@ariakit/react/form";
import {
  PROMPT_BODY_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  updatePromptInputSchema,
  type UpdatePromptInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatPromptIssue(issue: FormValidationIssue) {
  const field = issue.path.at(-1);

  if (field === "title") {
    return issue.code === "too_big"
      ? `Use ${formatCount(PROMPT_TITLE_MAX_LENGTH)} characters or fewer`
      : "Enter a title";
  }

  if (field === "body") {
    return issue.code === "too_big"
      ? `Use ${formatCount(PROMPT_BODY_MAX_LENGTH)} characters or fewer`
      : "Enter prompt text";
  }

  return issue.message;
}

export function usePromptFormValidation(form: FormStore<UpdatePromptInput>) {
  useZodFormValidation(form, updatePromptInputSchema, formatPromptIssue);
}
