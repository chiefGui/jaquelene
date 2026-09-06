import { describe, expect, it } from "vite-plus/test";
import { composeRegenerationConfiguration } from "./regeneration-configuration";

const campaign = {
  model: { providerId: "campaign-provider", modelId: "campaign-model" },
  reasoningPreset: "high",
};
const regenerationModel = { providerId: "regeneration-provider", modelId: "regeneration-model" };

describe("regeneration configuration", () => {
  it("preserves the campaign settings when the regeneration default is unset", () => {
    expect(composeRegenerationConfiguration(null, campaign)).toBe(campaign);
    expect(composeRegenerationConfiguration(null, null)).toBeNull();
  });

  it("uses the regeneration default independently of campaign reasoning", () => {
    const original = { ...campaign, model: { ...campaign.model } };
    expect(composeRegenerationConfiguration(regenerationModel, campaign)).toEqual({
      model: regenerationModel,
    });
    expect(campaign).toEqual(original);
    expect(composeRegenerationConfiguration(regenerationModel, null)).toEqual({
      model: regenerationModel,
    });
  });

  it("does not inherit campaign reasoning even when both defaults name the same model", () => {
    expect(composeRegenerationConfiguration(campaign.model, campaign)).toEqual({
      model: campaign.model,
    });
  });
});
