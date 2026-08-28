export type ModelReference = {
  providerId: string;
  modelId: string;
};

export function requireModelReference(reference: ModelReference) {
  if (!reference.providerId.trim() || !reference.modelId.trim()) {
    throw new TypeError("A model reference requires provider and model identities.");
  }
}

export type AvailableModel = {
  id: string;
  name: string;
  brandId: string;
};

export type ModelSelection = ModelReference & Omit<AvailableModel, "id">;

export function requireModelSelection(selection: ModelSelection) {
  requireModelReference(selection);

  if (!selection.name.trim() || !selection.brandId.trim()) {
    throw new TypeError("A model selection requires display metadata.");
  }
}

export type ModelProvider = {
  id: string;
  brandId: string;
  isConnected: () => Promise<boolean>;
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
    async listProviders() {
      const connectedProviders = await Promise.all(
        [...providersById.values()].map(async (provider) => ({
          provider,
          connected: await provider.isConnected(),
        })),
      );

      return connectedProviders.flatMap(({ provider: { brandId, id }, connected }) =>
        connected ? [{ brandId, id }] : [],
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
