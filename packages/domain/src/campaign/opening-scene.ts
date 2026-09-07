import * as z from "zod/mini";
import { PROMPT_BODY_MAX_LENGTH, PROMPT_BODY_MAX_UTF16_LENGTH } from "../prompt/content";

export const CAMPAIGN_OPENING_SCENE_MAX_LENGTH = PROMPT_BODY_MAX_LENGTH;
export const CAMPAIGN_OPENING_SCENE_MAX_UTF16_LENGTH = PROMPT_BODY_MAX_UTF16_LENGTH;

export const campaignOpeningSceneSchema = z
  .string()
  .check(z.maxLength(CAMPAIGN_OPENING_SCENE_MAX_LENGTH));
export type CampaignOpeningScene = z.output<typeof campaignOpeningSceneSchema>;

export function parseCampaignOpeningScene(value: unknown): string {
  const result = campaignOpeningSceneSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError("Campaign opening scene is invalid.", { cause: result.error });
  }
  if (!result.data.trim()) {
    return "";
  }
  return result.data;
}
