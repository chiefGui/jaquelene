import * as z from "zod/mini";
import { THREAD_MESSAGE_MAX_CODE_UNITS } from "../thread/content";

export const campaignOpeningSceneSchema = z
  .string()
  .check(z.refine((value) => value.length <= THREAD_MESSAGE_MAX_CODE_UNITS));
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
