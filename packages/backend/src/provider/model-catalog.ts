import type {
  CachedResource,
  ResourceCache,
  ResourceSnapshot,
} from "#backend/resource-cache/resource-cache";
import { ResourceUnavailableError } from "#backend/resource-cache/resource-cache";
import {
  requireReasoningEffort,
  type ProviderId,
  type ProviderModel,
  type ReasoningEffort,
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
  let reasoning: ProviderModel["reasoning"];
  let tokenPricing: ProviderModel["tokenPricing"];

  if (model.reasoning !== undefined) {
    if (
      typeof model.reasoning !== "object" ||
      model.reasoning === null ||
      typeof model.reasoning.required !== "boolean"
    ) {
      throw new TypeError(`Provider "${providerId}" model "${id}" has invalid reasoning.`);
    }

    const defaultEffort = model.reasoning.defaultEffort;
    const supportedEfforts = model.reasoning.supportedEfforts;

    if (defaultEffort !== undefined) {
      try {
        requireReasoningEffort(defaultEffort);
      } catch {
        throw new TypeError(
          `Provider "${providerId}" model "${id}" has an invalid default reasoning effort.`,
        );
      }
    }

    let normalizedSupportedEfforts: ReasoningEffort[] | undefined;

    if (supportedEfforts !== undefined) {
      if (!Array.isArray(supportedEfforts) || supportedEfforts.length === 0) {
        throw new TypeError(
          `Provider "${providerId}" model "${id}" has invalid supported reasoning efforts.`,
        );
      }

      const uniqueEfforts = new Set<ReasoningEffort>();

      for (const effort of supportedEfforts) {
        try {
          requireReasoningEffort(effort);
        } catch {
          throw new TypeError(
            `Provider "${providerId}" model "${id}" has an invalid supported reasoning effort.`,
          );
        }

        if (uniqueEfforts.has(effort)) {
          throw new TypeError(
            `Provider "${providerId}" model "${id}" repeats a supported reasoning effort.`,
          );
        }

        uniqueEfforts.add(effort);
      }

      normalizedSupportedEfforts = [...uniqueEfforts];
    }

    if (model.reasoning.required && normalizedSupportedEfforts?.includes("none")) {
      throw new TypeError(
        `Provider "${providerId}" model "${id}" requires reasoning but supports disabling it.`,
      );
    }

    if (model.reasoning.required && defaultEffort === "none") {
      throw new TypeError(
        `Provider "${providerId}" model "${id}" requires reasoning but disables it by default.`,
      );
    }

    if (
      defaultEffort !== undefined &&
      normalizedSupportedEfforts &&
      !normalizedSupportedEfforts.includes(defaultEffort)
    ) {
      throw new TypeError(
        `Provider "${providerId}" model "${id}" has an unsupported default reasoning effort.`,
      );
    }

    reasoning = {
      required: model.reasoning.required,
      ...(defaultEffort === undefined ? {} : { defaultEffort }),
      ...(normalizedSupportedEfforts ? { supportedEfforts: normalizedSupportedEfforts } : {}),
    };
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

  return {
    id,
    name,
    brandId,
    ...(reasoning ? { reasoning } : {}),
    ...(tokenPricing ? { tokenPricing } : {}),
  };
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
      version: 2,
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
            await resource.resolve(dependencies.getSource(providerId), signal ? { signal } : {}),
          ),
        );
      },
      refreshModels(providerId, signal) {
        return exposeCatalogFailure(async () =>
          toCatalogSnapshot(
            await resource.refresh(dependencies.getSource(providerId), {
              ...(signal ? { signal } : {}),
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
    },
  };
}
