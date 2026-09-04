import { describe, expect, it } from "vite-plus/test";
import {
  CAMPAIGN_TITLE_MAX_LENGTH,
  campaignTitleInputSchema,
  parseCampaignTitle,
  parseCampaignTitleInput,
} from "./title";

describe("campaign title", () => {
  it("normalizes surrounding whitespace", () => {
    expect(parseCampaignTitle("  First campaign  ")).toBe("First campaign");
  });

  it("allows the maximum number of Unicode characters", () => {
    expect(parseCampaignTitle("🌘".repeat(CAMPAIGN_TITLE_MAX_LENGTH))).toHaveLength(
      CAMPAIGN_TITLE_MAX_LENGTH * 2,
    );
  });

  it("rejects titles beyond the character limit", () => {
    expect(() => parseCampaignTitle("x".repeat(CAMPAIGN_TITLE_MAX_LENGTH + 1))).toThrow(TypeError);
  });

  it("rejects titles without text", () => {
    expect(() => parseCampaignTitle(" \n\t ")).toThrow("Campaign title is invalid.");
  });

  it("keeps title inputs exact", () => {
    expect(campaignTitleInputSchema.safeParse({ title: "Voyage", ignored: true }).success).toBe(
      false,
    );
    expect(() => parseCampaignTitleInput({ title: "Voyage", ignored: true })).toThrow(
      "Campaign title input is invalid.",
    );
    expect(parseCampaignTitleInput({ title: " Voyage " })).toEqual({ title: "Voyage" });
  });
});
