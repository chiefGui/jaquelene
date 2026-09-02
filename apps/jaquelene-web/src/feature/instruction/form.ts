import type { FormStore } from "@ariakit/react/form";
import {
  ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH,
  ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH,
  roleplayInstructionInputSchema,
  type RoleplayInstructionInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatRoleplayInstructionIssue(issue: FormValidationIssue) {
  const field = issue.path.at(-1);

  if (field === "title") {
    return issue.code === "too_big"
      ? `Use ${formatCount(ROLEPLAY_INSTRUCTION_TITLE_MAX_LENGTH)} characters or fewer.`
      : "Enter a title.";
  }

  if (field === "body") {
    return issue.code === "too_big"
      ? `Use ${formatCount(ROLEPLAY_INSTRUCTION_BODY_MAX_LENGTH)} characters or fewer.`
      : "Enter instruction text.";
  }

  return issue.message;
}

export function useRoleplayInstructionFormValidation(form: FormStore<RoleplayInstructionInput>) {
  useZodFormValidation(form, roleplayInstructionInputSchema, formatRoleplayInstructionIssue);
}
