import * as z from "zod/mini";
import { campaignScenarioSchema } from "./scenario";
import { campaignTitleSchema } from "./title";

export const campaignSetupInputSchema = z.strictObject({
  title: campaignTitleSchema,
  scenario: campaignScenarioSchema,
});

export type CampaignSetupInput = z.input<typeof campaignSetupInputSchema>;
