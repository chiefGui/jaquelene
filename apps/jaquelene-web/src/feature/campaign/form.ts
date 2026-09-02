import type { FormStore } from "@ariakit/react/form";
import {
  CAMPAIGN_TITLE_MAX_LENGTH,
  campaignTitleInputSchema,
  type CampaignTitleInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

function formatCampaignTitleIssue(issue: FormValidationIssue) {
  return issue.code === "too_big"
    ? `Use ${formatCount(CAMPAIGN_TITLE_MAX_LENGTH)} characters or fewer.`
    : "Enter a campaign title.";
}

export function useCampaignTitleFormValidation(form: FormStore<CampaignTitleInput>) {
  useZodFormValidation(form, campaignTitleInputSchema, formatCampaignTitleIssue);
}
