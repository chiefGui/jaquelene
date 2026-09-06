import { CAMPAIGN_TITLE_MAX_LENGTH } from "@jaquelene/domain";

// Native maxlength counts UTF-16 units; campaign titles count Unicode code points.
export function limitCampaignTitleInput(value: string, caret: number) {
  if (Array.from(value).length <= CAMPAIGN_TITLE_MAX_LENGTH) return { value, caret };

  // Remove excess inserted text before the caret, preserving the untouched suffix.
  const suffix = Array.from(value.slice(caret)).slice(0, CAMPAIGN_TITLE_MAX_LENGTH);
  const prefix = Array.from(value.slice(0, caret))
    .slice(0, CAMPAIGN_TITLE_MAX_LENGTH - suffix.length)
    .join("");

  return { value: prefix + suffix.join(""), caret: prefix.length };
}
