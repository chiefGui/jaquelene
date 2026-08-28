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
    const initial = { providerId: "provider-a", modelId: "model-a" };
    const replacement = { providerId: "provider-b", modelId: "model-b" };

    expect(preferences.getDefaultModel()).toBeNull();
    expect(preferences.setDefaultModel(initial)).toEqual(initial);
    expect(preferences.setDefaultModel(replacement)).toEqual(replacement);
    expect(preferences.getDefaultModel()).toEqual(replacement);
  });

  it("does not expose its stored model reference", () => {
    const preferences = createPreferences();
    const reference = { providerId: "provider-a", modelId: "model-a" };
    const returnedReference = preferences.setDefaultModel(reference);

    reference.modelId = "changed-input";
    returnedReference.modelId = "changed-output";

    expect(preferences.getDefaultModel()).toEqual({
      providerId: "provider-a",
      modelId: "model-a",
    });
  });

  it("rejects a default campaign model without provider or model identity", () => {
    const preferences = createPreferences();

    expect(() => preferences.setDefaultModel({ providerId: " ", modelId: "model-a" })).toThrow(
      TypeError,
    );
    expect(() => preferences.setDefaultModel({ providerId: "provider-a", modelId: " " })).toThrow(
      TypeError,
    );
  });
});
