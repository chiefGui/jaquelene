import * as z from "zod/mini";

export const CAMPAIGN_SCENARIO_MAX_LENGTH = 20_000;
export const CAMPAIGN_SCENARIO_MAX_UTF16_LENGTH = CAMPAIGN_SCENARIO_MAX_LENGTH * 2;

export const campaignScenarioSchema = z.string().check(z.maxLength(CAMPAIGN_SCENARIO_MAX_LENGTH));

export type CampaignScenario = z.output<typeof campaignScenarioSchema>;

export function parseCampaignScenario(value: unknown): string {
  const result = campaignScenarioSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("Campaign scenario is invalid.", { cause: result.error });
  }

  if (!result.data.trim()) {
    return "";
  }

  // Preserve indentation and line breaks because the content is Markdown.
  return result.data;
}
