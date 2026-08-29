import { requireModelReference, type ModelReference } from "@jaquelene/backend";

export { requireModelReference, type ModelReference };

export type AvailableModel = {
  id: string;
  name: string;
  brandId: string;
  tokenPricing?: {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  };
};

export type ModelSelection = ModelReference & Pick<AvailableModel, "brandId" | "name">;

export function requireModelSelection(selection: ModelSelection) {
  requireModelReference(selection);

  if (!selection.name.trim() || !selection.brandId.trim()) {
    throw new TypeError("A model selection requires display metadata.");
  }
}

export type ModelProvider = {
  id: string;
  brandId: string;
  isConfigured: () => boolean;
  listModels: () => Promise<AvailableModel[]>;
};

export function createModelCatalog(providers: readonly ModelProvider[]) {
  const providersById = new Map<string, ModelProvider>();

  for (const provider of providers) {
    if (!provider.id.trim() || !provider.brandId.trim()) {
      throw new TypeError("Model providers require provider and brand identities.");
    }

    if (providersById.has(provider.id)) {
      throw new Error(`Model provider "${provider.id}" is registered more than once.`);
    }

    providersById.set(provider.id, provider);
  }

  return {
    listProviders() {
      return [...providersById.values()].flatMap(({ brandId, id, isConfigured }) =>
        isConfigured() ? [{ brandId, id }] : [],
      );
    },

    listModels(providerId: string) {
      const provider = providersById.get(providerId);

      if (!provider) {
        throw new RangeError(`Unknown model provider "${providerId}".`);
      }

      return provider.listModels();
    },
  };
}

export type ModelCatalog = ReturnType<typeof createModelCatalog>;
