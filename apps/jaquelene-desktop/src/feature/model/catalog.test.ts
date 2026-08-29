import { describe, expect, it } from "vite-plus/test";
import { requireModelReference, requireModelSelection } from "./catalog";

describe("model references", () => {
  it("requires provider and model identities", () => {
    expect(() => requireModelReference({ providerId: " ", modelId: "model-a" })).toThrow(TypeError);
    expect(() => requireModelReference({ providerId: "provider-a", modelId: " " })).toThrow(
      TypeError,
    );
    expect(() =>
      requireModelReference({ providerId: "provider-a", modelId: "model-a" }),
    ).not.toThrow();
  });
});

describe("model selections", () => {
  it("requires display metadata", () => {
    expect(() =>
      requireModelSelection({
        providerId: "provider-a",
        modelId: "model-a",
        name: " ",
        brandId: "brand-a",
      }),
    ).toThrow(TypeError);
    expect(() =>
      requireModelSelection({
        providerId: "provider-a",
        modelId: "model-a",
        name: "Model A",
        brandId: " ",
      }),
    ).toThrow(TypeError);
    expect(() =>
      requireModelSelection({
        providerId: "provider-a",
        modelId: "model-a",
        name: "Model A",
        brandId: "brand-a",
      }),
    ).not.toThrow();
  });
});
