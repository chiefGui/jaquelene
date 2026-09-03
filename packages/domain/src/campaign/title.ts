import * as z from "zod/mini";

export const CAMPAIGN_TITLE_MAX_LENGTH = 120;

// A 120-code-point title can occupy at most 240 UTF-16 code units. This is the
// safety bound for DOM and transport adapters, which count string length
// differently from Zod and SQLite.
export const CAMPAIGN_TITLE_MAX_UTF16_LENGTH = CAMPAIGN_TITLE_MAX_LENGTH * 2;

export const campaignTitleSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(CAMPAIGN_TITLE_MAX_LENGTH))
  .brand<"CampaignTitle">();

export const campaignTitleInputSchema = z.strictObject({ title: campaignTitleSchema });

export type CampaignTitle = z.output<typeof campaignTitleSchema>;
export type CampaignTitleInput = z.input<typeof campaignTitleInputSchema>;

export function parseCampaignTitle(value: unknown): CampaignTitle {
  const result = campaignTitleSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("Campaign title is invalid.", { cause: result.error });
  }

  return result.data;
}

export function parseCampaignTitleInput(value: unknown) {
  const result = campaignTitleInputSchema.safeParse(value);

  if (!result.success) {
    throw new TypeError("Campaign title input is invalid.", { cause: result.error });
  }

  return result.data;
}
