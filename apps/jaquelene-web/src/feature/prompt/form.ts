import type { FormStore } from "@ariakit/react/form";
import {
  PROMPT_BODY_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  updatePromptInputSchema,
  type UpdatePromptInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatPromptIssue(issue: FormValidationIssue, noun: string) {
  const field = issue.path.at(-1);

  if (field === "title") {
    if (issue.code === "too_big")
      return `Use ${formatCount(PROMPT_TITLE_MAX_LENGTH)} characters or fewer`;
    return "Enter a title";
  }

  if (field === "body") {
    if (issue.code === "too_big")
      return `Use ${formatCount(PROMPT_BODY_MAX_LENGTH)} characters or fewer`;
    return `Enter ${noun} text`;
  }

  return issue.message;
}

export function usePromptFormValidation(form: FormStore<UpdatePromptInput>, noun: string) {
  useZodFormValidation(form, updatePromptInputSchema, (issue) => formatPromptIssue(issue, noun));
}
