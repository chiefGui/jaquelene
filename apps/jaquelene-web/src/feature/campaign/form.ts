import type { FormStore } from "@ariakit/react/form";
import {
  CAMPAIGN_TITLE_MAX_LENGTH,
  campaignTitleInputSchema,
  type CampaignTitleInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

export function formatCampaignTitleIssue(issue: FormValidationIssue) {
  if (issue.code === "too_big") {
    return `Use ${formatCount(CAMPAIGN_TITLE_MAX_LENGTH)} characters or fewer`;
  }
  return "Enter a campaign title";
}

export function useCampaignTitleFormValidation(form: FormStore<CampaignTitleInput>) {
  useZodFormValidation(form, campaignTitleInputSchema, formatCampaignTitleIssue);
}
