import {
  createProviderModel,
  requireContextWindowTokens,
  type ProviderModelsAdapter,
} from "@jaquelene/backend";
import type { ApiKeyConfiguration } from "../api-key-configuration";
import { removeKnownAuthorPrefix, resolveModelAuthor } from "../model-author";
import { normalizeNanoGptReasoning } from "./reasoning";

type LoadNanoGptModels = (apiKey: string, signal: AbortSignal) => Promise<readonly unknown[]>;

type JsonObject = Record<string, unknown>;

function requireObject(candidate: unknown, description: string): JsonObject {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError(`${description} must be an object.`);
  }

  return candidate as JsonObject;
}

function requireText(candidate: unknown, description: string) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new TypeError(`${description} must contain text.`);
  }

  return candidate.trim();
}

function normalizeName(id: string, candidate: unknown, ownerId: string) {
  const name = requireText(candidate, `NanoGPT model "${id}" name`);
  const author = resolveModelAuthor(ownerId);
  const displayName = removeKnownAuthorPrefix(name, ownerId, author);

  if (!displayName) {
    throw new TypeError(`NanoGPT model "${id}" name must contain text.`);
  }

  return { brandId: author.brandId, displayName };
}

function normalizeContextWindow(id: string, candidate: unknown) {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  return requireContextWindowTokens(candidate, `NanoGPT model "${id}" context window`);
}

function normalizeTokenPricing(id: string, candidate: unknown) {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  const pricing = requireObject(candidate, `NanoGPT model "${id}" pricing`);
  const { prompt, completion } = pricing;

  if (
    (prompt === undefined || prompt === null) &&
    (completion === undefined || completion === null)
  ) {
    return undefined;
  }

  if (
    typeof prompt !== "number" ||
    !Number.isFinite(prompt) ||
    prompt < 0 ||
    typeof completion !== "number" ||
    !Number.isFinite(completion) ||
    completion < 0 ||
    pricing.currency !== "USD" ||
    pricing.unit !== "per_million_tokens"
  ) {
    throw new TypeError(`NanoGPT model "${id}" has invalid pricing.`);
  }

  return { inputUsdPerMillion: prompt, outputUsdPerMillion: completion };
}

function normalizeModel(candidate: unknown) {
  const model = requireObject(candidate, "A NanoGPT model");
  const id = requireText(model.id, "A NanoGPT model identity");
  const ownerId = requireText(model.owned_by, `NanoGPT model "${id}" owner`).toLowerCase();
  const { brandId, displayName } = normalizeName(id, model.name, ownerId);
  const contextWindowTokens = normalizeContextWindow(id, model.context_length);
  const tokenPricing = normalizeTokenPricing(id, model.pricing);
  let capabilities: JsonObject | undefined;

  if (model.capabilities !== undefined && model.capabilities !== null) {
    capabilities = requireObject(model.capabilities, `NanoGPT model "${id}" capabilities`);
  }

  const reasoning = normalizeNanoGptReasoning(id, capabilities?.reasoning, model.reasoning_efforts);
  return createProviderModel({
    id,
    name: displayName,
    brandId,
    contextWindowTokens,
    reasoning,
    tokenPricing,
  });
}

async function loadNanoGptModels(apiKey: string, signal: AbortSignal) {
  const response = await fetch("https://nano-gpt.com/api/v1/models?detailed=true", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  const responseBody = await response.text();
  let body: unknown;

  try {
    body = JSON.parse(responseBody);
  } catch (cause) {
    if (response.ok) {
      throw new TypeError("NanoGPT returned an invalid JSON model catalog.", { cause });
    }

    body = responseBody;
  }

  if (!response.ok) {
    throw new Error(`NanoGPT rejected the model request with status ${response.status}.`, {
      cause: body,
    });
  }

  const catalog = requireObject(body, "The NanoGPT model catalog");

  if (!Array.isArray(catalog.data)) {
    throw new TypeError("The NanoGPT model catalog must contain a model list.");
  }

  return catalog.data;
}

export function createNanoGptModels(
  configuration: Pick<ApiKeyConfiguration, "withApiKey">,
  loadModels: LoadNanoGptModels = loadNanoGptModels,
): ProviderModelsAdapter {
  return {
    list: (signal) =>
      configuration.withApiKey(async (apiKey) =>
        (await loadModels(apiKey, signal)).map(normalizeModel),
      ),
  };
}
