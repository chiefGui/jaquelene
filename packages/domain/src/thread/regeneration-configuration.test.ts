import { describe, expect, it } from "vite-plus/test";
import { composeRegenerationConfiguration } from "./regeneration-configuration";

const regenerationModel = { providerId: "regeneration-provider", modelId: "regeneration-model" };

describe("regeneration configuration", () => {
  it("requires a model choice when the regeneration default is unset", () => {
    expect(composeRegenerationConfiguration(null)).toBeNull();
  });

  it("preselects the regeneration default with the model's default reasoning", () => {
    expect(composeRegenerationConfiguration(regenerationModel)).toEqual({
      model: regenerationModel,
    });
  });
});
