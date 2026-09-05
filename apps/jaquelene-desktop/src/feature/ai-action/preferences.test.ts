import { describe, expect, it } from "vite-plus/test";
import { createAiActionPreferences, type AiActionPreferenceValues } from "./preferences";

describe("AI action preferences", () => {
  it("selects, replaces, and clears its model without exposing stored values", () => {
    let values: AiActionPreferenceValues | undefined;
    const preferences = createAiActionPreferences({
      read: () => values,
      write: (next) => {
        values = next;
      },
    });
    const model = { providerId: "test", modelId: "first", name: "First", brandId: "test" };
    expect(preferences.getModel()).toBeNull();
    const selected = preferences.setModel(model)!;
    model.modelId = "changed";
    Object.assign(selected, { name: "Changed" });
    expect(preferences.getModel()).toEqual({
      providerId: "test",
      modelId: "first",
      name: "First",
      brandId: "test",
    });
    preferences.setModel({ ...model, modelId: "second" });
    expect(preferences.getModel()?.modelId).toBe("second");
    expect(preferences.setModel(null)).toBeNull();
    expect(preferences.getModel()).toBeNull();
  });

  it("rejects invalid selections before writing", () => {
    const preferences = createAiActionPreferences({
      read: () => undefined,
      write: () => {
        throw new Error("Unexpected write");
      },
    });
    expect(() =>
      preferences.setModel({ providerId: " ", modelId: "m", name: "M", brandId: "test" }),
    ).toThrow(TypeError);
  });
});
