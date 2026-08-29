import { describe, expect, it, vi } from "vite-plus/test";
import { createModelCatalog, requireModelReference, requireModelSelection } from "./catalog";

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

describe("model catalog", () => {
  it("lists configured providers and routes model requests by provider identity", async () => {
    const listFirstModels = vi.fn(async () => [
      { id: "first/model", name: "First model", brandId: "first-maker" },
    ]);
    const listSecondModels = vi.fn(async () => [
      { id: "second/model", name: "Second model", brandId: "second-maker" },
    ]);
    const catalog = createModelCatalog([
      {
        id: "first",
        brandId: "first-brand",
        isConfigured: () => true,
        listModels: listFirstModels,
      },
      {
        id: "second",
        brandId: "second-brand",
        isConfigured: () => true,
        listModels: listSecondModels,
      },
    ]);

    expect(catalog.listProviders()).toEqual([
      { id: "first", brandId: "first-brand" },
      { id: "second", brandId: "second-brand" },
    ]);
    await expect(catalog.listModels("second")).resolves.toEqual([
      { id: "second/model", name: "Second model", brandId: "second-maker" },
    ]);
    expect(listFirstModels).not.toHaveBeenCalled();
    expect(listSecondModels).toHaveBeenCalledOnce();
  });

  it("omits unconfigured providers", () => {
    const catalog = createModelCatalog([
      {
        id: "connected",
        brandId: "connected-brand",
        isConfigured: () => true,
        listModels: async () => [],
      },
      {
        id: "disconnected",
        brandId: "disconnected-brand",
        isConfigured: () => false,
        listModels: async () => [],
      },
    ]);

    expect(catalog.listProviders()).toEqual([{ id: "connected", brandId: "connected-brand" }]);
  });

  it("rejects an unknown provider", () => {
    const catalog = createModelCatalog([]);

    expect(() => catalog.listModels("missing")).toThrow(RangeError);
  });

  it("requires every provider identity to be unique", () => {
    const provider = {
      id: "duplicate",
      brandId: "duplicate-brand",
      isConfigured: () => true,
      listModels: async () => [],
    };

    expect(() => createModelCatalog([provider, provider])).toThrow(
      'Model provider "duplicate" is registered more than once.',
    );
  });
});
