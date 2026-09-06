import type { FormStore } from "@ariakit/react/form";
import {
  CAMPAIGN_SCENARIO_MAX_LENGTH,
  CAMPAIGN_TITLE_MAX_LENGTH,
  campaignSetupInputSchema,
  type CampaignSetupInput,
} from "@jaquelene/domain";
import { formatCount } from "@jaquelene/ui";
import { useZodFormValidation, type FormValidationIssue } from "@/feature/form/zod";

export function formatCampaignScenarioIssue() {
  return `Use ${formatCount(CAMPAIGN_SCENARIO_MAX_LENGTH)} characters or fewer`;
}

export function useStartCampaignFormValidation(form: FormStore<CampaignSetupInput>) {
  useZodFormValidation(form, campaignSetupInputSchema, (issue) => {
    if (issue.path[0] === "scenario") {
      return formatCampaignScenarioIssue();
    }
    return formatCampaignTitleIssue(issue);
  });
}

export function formatCampaignTitleIssue(issue: FormValidationIssue) {
  if (issue.code === "too_big") {
    return `Use ${formatCount(CAMPAIGN_TITLE_MAX_LENGTH)} characters or fewer`;
  }
  return "Enter a campaign title";
}
