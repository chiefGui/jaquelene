import { describe, expect, it } from "vite-plus/test";
import { createCampaignPreferences, type CampaignPreferenceValues } from "./preferences";

function createPreferences() {
  let storedValues: CampaignPreferenceValues | undefined;

  return createCampaignPreferences({
    read: () => storedValues,
    write: (values) => {
      storedValues = values;
    },
  });
}

describe("campaign preferences", () => {
  it("replaces the default campaign model", () => {
    const preferences = createPreferences();
    const initial = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };
    const replacement = {
      providerId: "provider-b",
      modelId: "model-b",
      name: "Model B",
      brandId: "brand-b",
    };

    expect(preferences.getDefaultModel()).toBeNull();
    expect(preferences.setDefaultModel(initial)).toEqual(initial);
    expect(preferences.setDefaultModel(replacement)).toEqual(replacement);
    expect(preferences.getDefaultModel()).toEqual(replacement);
  });

  it("does not expose its stored model selection", () => {
    const preferences = createPreferences();
    const selection = {
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    };
    const returnedSelection = preferences.setDefaultModel(selection);

    selection.modelId = "changed-input";
    returnedSelection.name = "changed-output";

    expect(preferences.getDefaultModel()).toEqual({
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    });
  });

  it("rejects an incomplete default campaign model selection", () => {
    const preferences = createPreferences();
    const model = { name: "Model A", brandId: "brand-a" };

    expect(() =>
      preferences.setDefaultModel({ providerId: " ", modelId: "model-a", ...model }),
    ).toThrow(TypeError);
    expect(() =>
      preferences.setDefaultModel({ providerId: "provider-a", modelId: " ", ...model }),
    ).toThrow(TypeError);
    expect(() =>
      preferences.setDefaultModel({
        providerId: "provider-a",
        modelId: "model-a",
        name: " ",
        brandId: "brand-a",
      }),
    ).toThrow(TypeError);
  });
});
