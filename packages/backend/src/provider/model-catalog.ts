import type {
  CachedResource,
  ResourceCache,
  ResourceSnapshot,
} from "#backend/resource-cache/resource-cache";
import { ResourceUnavailableError } from "#backend/resource-cache/resource-cache";
import { requireModelReasoningCapability } from "#backend/model/reasoning";
import {
  createProviderModel,
  requireContextWindowTokens,
  requireModelReference,
  type ModelReference,
  type ProviderId,
  type ProviderModel,
} from "./provider";

const namespace = "model-catalog";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export type ModelProvider = Readonly<{
  id: ProviderId;
  brandId: string;
}>;

export type ModelCatalogSnapshot = Readonly<{
  models: readonly ProviderModel[];
  revision: number;
  freshness: "fresh" | "stale";
  updatedAt: number;
  discardAt: number;
  refresh:
    | Readonly<{ state: "idle" }>
    | Readonly<{ state: "refreshing"; startedAt: number }>
    | Readonly<{
        state: "failed";
        failedAt: number;
        retryAt: number;
        failureKind: "source" | "timeout";
      }>;
}>;

export type Models = Readonly<{
  listProviders: () => readonly ModelProvider[];
  getModels: (providerId: ProviderId, signal?: AbortSignal) => Promise<ModelCatalogSnapshot>;
  getModel: (reference: ModelReference, signal?: AbortSignal) => Promise<ProviderModel>;
  refreshModels: (providerId: ProviderId, signal?: AbortSignal) => Promise<ModelCatalogSnapshot>;
  subscribe: (listener: (providerId: ProviderId, revision: number) => void) => () => void;
}>;

export type ModelCatalogSource = Readonly<{
  providerId: ProviderId;
  configurationRevision: string;
  list: (signal: AbortSignal) => Promise<readonly ProviderModel[]>;
}>;

export type ModelCatalogDependencies = Readonly<{
  listProviders: () => readonly ModelProvider[];
  getSource: (providerId: ProviderId) => ModelCatalogSource;
}>;

type ModelCatalogValue = Readonly<{
  providerId: ProviderId;
  models: readonly ProviderModel[];
}>;

function requireText(value: unknown, description: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${description} must contain text.`);
  }

  return value;
}

function requireModel(providerId: ProviderId, candidate: unknown): ProviderModel {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError(`Provider "${providerId}" returned an invalid model.`);
  }

  const model = candidate as Partial<ProviderModel>;
  const id = requireText(model.id, `Provider "${providerId}" model identity`);
  const name = requireText(model.name, `Provider "${providerId}" model "${id}" name`);
  const brandId = requireText(
    model.brandId,
    `Provider "${providerId}" model "${id}" brand identity`,
  );
  let contextWindowTokens: ProviderModel["contextWindowTokens"];
  let reasoning: ProviderModel["reasoning"];
  let tokenPricing: ProviderModel["tokenPricing"];

  if (model.contextWindowTokens !== undefined) {
    contextWindowTokens = requireContextWindowTokens(
      model.contextWindowTokens,
      `Provider "${providerId}" model "${id}" context window`,
    );
  }

  if (model.reasoning !== undefined) {
    reasoning = requireModelReasoningCapability(
      model.reasoning,
      `Provider "${providerId}" model "${id}" reasoning`,
    );
  }

  if (model.tokenPricing !== undefined) {
    const { inputUsdPerMillion, outputUsdPerMillion } = model.tokenPricing;

    if (
      !Number.isFinite(inputUsdPerMillion) ||
      inputUsdPerMillion < 0 ||
      !Number.isFinite(outputUsdPerMillion) ||
      outputUsdPerMillion < 0
    ) {
      throw new TypeError(`Provider "${providerId}" model "${id}" has invalid pricing.`);
    }

    tokenPricing = { inputUsdPerMillion, outputUsdPerMillion };
  }

  return createProviderModel({
    id,
    name,
    brandId,
    contextWindowTokens,
    reasoning,
    tokenPricing,
  });
}

function requireModels(providerId: ProviderId, candidates: readonly unknown[]) {
  const models = new Map<string, ProviderModel>();

  for (const candidate of candidates) {
    const model = requireModel(providerId, candidate);

    if (models.has(model.id)) {
      throw new Error(`Provider "${providerId}" returned model "${model.id}" more than once.`);
    }

    models.set(model.id, model);
  }

  return [...models.values()];
}

function decodeValue(payload: Uint8Array): ModelCatalogValue {
  const candidate: unknown = JSON.parse(textDecoder.decode(payload));

  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError("A persisted model catalog must be an object.");
  }

  const value = candidate as Partial<ModelCatalogValue>;
  const providerId = requireText(value.providerId, "A persisted model catalog provider identity");

  if (!Array.isArray(value.models)) {
    throw new TypeError(`Persisted model catalog "${providerId}" has invalid models.`);
  }

  return { providerId, models: requireModels(providerId, value.models) };
}

function operationOptions(signal: AbortSignal | undefined) {
  if (signal) {
    return { signal };
  }

  return {};
}

function toCatalogSnapshot(snapshot: ResourceSnapshot<ModelCatalogValue>): ModelCatalogSnapshot {
  if (snapshot.availability.state !== "available") {
    throw new Error("The model catalog cache returned no value after resolving it.");
  }

  return {
    models: snapshot.availability.value.models,
    revision: snapshot.revision,
    freshness: snapshot.availability.freshness,
    updatedAt: snapshot.availability.storedAt,
    discardAt: snapshot.availability.discardAt,
    refresh: snapshot.refresh,
  };
}

async function exposeCatalogFailure(operation: () => Promise<ModelCatalogSnapshot>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ResourceUnavailableError && error.cause instanceof Error) {
      throw error.cause;
    }

    throw error;
  }
}

export type ModelCatalog = Readonly<{
  models: Models;
  invalidateProvider: (providerId: ProviderId) => Promise<void>;
  close: () => void;
}>;

export function createModelCatalog(
  cache: ResourceCache,
  dependencies: ModelCatalogDependencies,
): ModelCatalog {
  const resource: CachedResource<ModelCatalogSource, ModelCatalogValue> = cache.define({
    namespace,
    address: ({ providerId, configurationRevision }) => ({
      namespace,
      scope: providerId,
      key: configurationRevision,
    }),
    codec: {
      version: 4,
      encode: (value) => textEncoder.encode(JSON.stringify(value)),
      decode: (payload, input) => {
        const value = decodeValue(payload);

        if (value.providerId !== input.providerId) {
          throw new TypeError("A persisted model catalog belongs to a different provider.");
        }

        return value;
      },
    },
    policy: {
      freshFor: 15 * 60 * 1_000,
      retainFor: 30 * 24 * 60 * 60 * 1_000,
      retryAfter: 30 * 1_000,
      timeout: 12 * 1_000,
      maxEntryBytes: 8 * 1_024 * 1_024,
    },
    async load(source, signal) {
      const models = await source.list(signal);
      return {
        providerId: source.providerId,
        models: requireModels(source.providerId, models),
      };
    },
  });

  const listeners = new Set<(providerId: ProviderId, revision: number) => void>();
  const modelIndexes = new Map<
    ProviderId,
    Readonly<{ revision: number; modelsById: ReadonlyMap<string, ProviderModel> }>
  >();
  const unsubscribe = cache.subscribe((event) => {
    if (event.address.namespace !== namespace) {
      return;
    }

    const failures: unknown[] = [];

    for (const listener of listeners) {
      try {
        listener(event.address.scope, event.revision);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }

    if (failures.length > 1) {
      throw new AggregateError(failures, "Multiple model catalog listeners failed.");
    }
  });

  return {
    models: {
      listProviders: dependencies.listProviders,
      getModels(providerId, signal) {
        return exposeCatalogFailure(async () =>
          toCatalogSnapshot(
            await resource.resolve(dependencies.getSource(providerId), operationOptions(signal)),
          ),
        );
      },
      async getModel(reference, signal) {
        requireModelReference(reference);
        const snapshot = await exposeCatalogFailure(async () =>
          toCatalogSnapshot(
            await resource.resolve(
              dependencies.getSource(reference.providerId),
              operationOptions(signal),
            ),
          ),
        );
        let index = modelIndexes.get(reference.providerId);

        if (!index || index.revision !== snapshot.revision) {
          index = {
            revision: snapshot.revision,
            modelsById: new Map(snapshot.models.map((model) => [model.id, model])),
          };
          modelIndexes.set(reference.providerId, index);
        }

        const model = index.modelsById.get(reference.modelId);

        if (!model) {
          throw new RangeError(
            `Provider "${reference.providerId}" does not expose model "${reference.modelId}".`,
          );
        }

        return model;
      },
      refreshModels(providerId, signal) {
        return exposeCatalogFailure(async () =>
          toCatalogSnapshot(
            await resource.refresh(dependencies.getSource(providerId), {
              ...operationOptions(signal),
              force: true,
            }),
          ),
        );
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    invalidateProvider: (providerId) => resource.invalidate({ scope: providerId }),
    close() {
      unsubscribe();
      listeners.clear();
      modelIndexes.clear();
    },
  };
}
