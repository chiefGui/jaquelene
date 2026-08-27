import { describe, expect, it, vi } from "vite-plus/test";
import { createModelCatalog } from "./catalog";

describe("model catalog", () => {
  it("lists registered providers and routes model requests by provider identity", async () => {
    const listFirstModels = vi.fn(async () => [{ id: "first/model", name: "First model" }]);
    const listSecondModels = vi.fn(async () => [{ id: "second/model", name: "Second model" }]);
    const catalog = createModelCatalog([
      { id: "first", name: "First", listModels: listFirstModels },
      { id: "second", name: "Second", listModels: listSecondModels },
    ]);

    expect(catalog.listProviders()).toEqual([
      { id: "first", name: "First" },
      { id: "second", name: "Second" },
    ]);
    await expect(catalog.listModels("second")).resolves.toEqual([
      { id: "second/model", name: "Second model" },
    ]);
    expect(listFirstModels).not.toHaveBeenCalled();
    expect(listSecondModels).toHaveBeenCalledOnce();
  });

  it("rejects an unknown provider", () => {
    const catalog = createModelCatalog([]);

    expect(() => catalog.listModels("missing")).toThrow(RangeError);
  });

  it("requires every provider identity to be unique", () => {
    const provider = { id: "duplicate", name: "Duplicate", listModels: async () => [] };

    expect(() => createModelCatalog([provider, provider])).toThrow(
      'Model provider "duplicate" is registered more than once.',
    );
  });
});
