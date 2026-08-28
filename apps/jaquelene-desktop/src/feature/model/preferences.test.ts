import { describe, expect, it } from "vite-plus/test";
import { createModelPreferences, type ModelPreferenceValues } from "./preferences";

function createPreferences() {
  let storedValues: ModelPreferenceValues | undefined;

  return createModelPreferences({
    read: () => storedValues,
    write: (values) => {
      storedValues = values;
    },
  });
}

describe("model preferences", () => {
  it("replaces the default model", () => {
    const preferences = createPreferences();
    const initial = { providerId: "provider-a", modelId: "model-a" };
    const replacement = { providerId: "provider-b", modelId: "model-b" };

    expect(preferences.get()).toEqual({});
    expect(preferences.setDefault(initial)).toEqual({ default: initial });
    expect(preferences.setDefault(replacement)).toEqual({ default: replacement });
    expect(preferences.get()).toEqual({ default: replacement });
  });

  it("rejects a default without provider or model identity", () => {
    const preferences = createPreferences();

    expect(() => preferences.setDefault({ providerId: " ", modelId: "model-a" })).toThrow(
      TypeError,
    );
    expect(() => preferences.setDefault({ providerId: "provider-a", modelId: " " })).toThrow(
      TypeError,
    );
  });
});
