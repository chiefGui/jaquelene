import { CAMPAIGN_TITLE_MAX_LENGTH, campaignTitleInputSchema } from "@jaquelene/domain";
import { describe, expect, it } from "vite-plus/test";
import { limitCampaignTitleInput } from "./title-input";

describe("campaign title input limit", () => {
  it("leaves titles and the caret unchanged within the limit", () => {
    expect(limitCampaignTitleInput("Moonrise", 4)).toEqual({ value: "Moonrise", caret: 4 });
    expect(limitCampaignTitleInput("", 0)).toEqual({ value: "", caret: 0 });
  });

  it("stops typing and long pastes at the title limit", () => {
    const accepted = "a".repeat(CAMPAIGN_TITLE_MAX_LENGTH);
    for (const extra of ["b", "b".repeat(CAMPAIGN_TITLE_MAX_LENGTH)]) {
      const pasted = accepted + extra;
      expect(limitCampaignTitleInput(pasted, pasted.length)).toEqual({
        value: accepted,
        caret: accepted.length,
      });
    }
  });

  it("preserves trailing text when pasting into the middle of a title", () => {
    const pasted = "Start " + "a".repeat(CAMPAIGN_TITLE_MAX_LENGTH) + " end";
    const caret = pasted.length - " end".length;
    expect(limitCampaignTitleInput(pasted, caret)).toEqual({
      value: "Start " + "a".repeat(CAMPAIGN_TITLE_MAX_LENGTH - 10) + " end",
      caret: CAMPAIGN_TITLE_MAX_LENGTH - 4,
    });
  });

  it("allows the full Unicode limit without cutting a surrogate pair", () => {
    const accepted = "🌘".repeat(CAMPAIGN_TITLE_MAX_LENGTH);
    expect(limitCampaignTitleInput(accepted, accepted.length).value).toBe(accepted);
    const pasted = accepted + "🌘";
    const limited = limitCampaignTitleInput(pasted, pasted.length);
    expect(limited).toEqual({ value: accepted, caret: accepted.length });
    expect(campaignTitleInputSchema.safeParse({ title: limited.value }).success).toBe(true);
  });

  it("keeps the caret before a Unicode suffix when insertion exceeds the limit", () => {
    const pasted = "a".repeat(CAMPAIGN_TITLE_MAX_LENGTH) + "🌘";
    expect(limitCampaignTitleInput(pasted, CAMPAIGN_TITLE_MAX_LENGTH)).toEqual({
      value: "a".repeat(CAMPAIGN_TITLE_MAX_LENGTH - 1) + "🌘",
      caret: CAMPAIGN_TITLE_MAX_LENGTH - 1,
    });
  });
});
