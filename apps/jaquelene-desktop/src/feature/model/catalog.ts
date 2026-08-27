export type ModelReference = {
  providerId: string;
  modelId: string;
};

export type AvailableModel = {
  id: string;
  name: string;
};

export type ModelProvider = {
  id: string;
  name: string;
  listModels: () => Promise<AvailableModel[]>;
};

export function createModelCatalog(providers: readonly ModelProvider[]) {
  const providersById = new Map<string, ModelProvider>();

  for (const provider of providers) {
    if (!provider.id.trim() || !provider.name.trim()) {
      throw new TypeError("Model providers require an identity and name.");
    }

    if (providersById.has(provider.id)) {
      throw new Error(`Model provider "${provider.id}" is registered more than once.`);
    }

    providersById.set(provider.id, provider);
  }

  return {
    listProviders: () => [...providersById.values()].map(({ id, name }) => ({ id, name })),

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
