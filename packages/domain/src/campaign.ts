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
export type CampaignTitleErrorReason = "empty" | "invalid-type" | "too-long";

export class InvalidCampaignTitleError extends TypeError {
  override readonly name = "InvalidCampaignTitleError";

  constructor(readonly reason: CampaignTitleErrorReason) {
    const message =
      reason === "empty"
        ? "Campaign title must contain text."
        : reason === "too-long"
          ? `Campaign title cannot exceed ${CAMPAIGN_TITLE_MAX_LENGTH} characters.`
          : "Campaign title must be text.";

    super(message);
  }
}

function campaignTitleError(issue: z.core.$ZodIssue | undefined) {
  if (issue?.code === "invalid_type") {
    return new InvalidCampaignTitleError("invalid-type");
  }

  if (issue?.code === "too_big") {
    return new InvalidCampaignTitleError("too-long");
  }

  return new InvalidCampaignTitleError("empty");
}

export function parseCampaignTitle(value: unknown): CampaignTitle {
  const result = campaignTitleSchema.safeParse(value);

  if (!result.success) {
    throw campaignTitleError(result.error.issues[0]);
  }

  return result.data;
}

export function parseCampaignTitleInput(value: unknown) {
  const result = campaignTitleInputSchema.safeParse(value);

  if (!result.success) {
    const titleIssue = result.error.issues.find((issue) => issue.path.at(-1) === "title");

    if (!titleIssue) {
      throw new TypeError("Campaign title input is invalid.");
    }

    throw campaignTitleError(titleIssue);
  }

  return result.data;
}
