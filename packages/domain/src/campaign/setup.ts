import * as z from "zod/mini";
import { campaignOpeningSceneSchema } from "./opening-scene";
import { campaignScenarioSchema } from "./scenario";
import { campaignTitleSchema } from "./title";

export const campaignSetupInputSchema = z.strictObject({
  title: campaignTitleSchema,
  scenario: campaignScenarioSchema,
  openingScene: campaignOpeningSceneSchema,
});

export type CampaignSetupInput = z.input<typeof campaignSetupInputSchema>;
