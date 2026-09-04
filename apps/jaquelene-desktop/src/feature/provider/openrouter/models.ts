import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { modelsListForUser } from "@openrouter/sdk/funcs/modelsListForUser.js";
import {
  createProviderModel,
  requireContextWindowTokens,
  type ProviderModelsAdapter,
} from "@jaquelene/backend";
import type { ApiKeyConfiguration } from "../api-key-configuration";
import { removeKnownAuthorPrefix, resolveModelAuthor } from "../model-author";
import { normalizeOpenRouterReasoning, type OpenRouterReasoningMetadata } from "./reasoning";

type OpenRouterCatalogModel = {
  id: string;
  name: string;
  contextLength: number | null;
  architecture: {
    inputModalities: readonly string[];
    outputModalities: readonly string[];
  };
  pricing: {
    prompt: string;
    completion: string;
    discount?: number | undefined;
  };
  reasoning?: OpenRouterReasoningMetadata | undefined;
};

type LoadOpenRouterModels = (
  apiKey: string,
  signal: AbortSignal,
) => Promise<readonly OpenRouterCatalogModel[]>;

const client = new OpenRouterCore({
  appTitle: "Jaquelene",
  retryConfig: { strategy: "none" },
  timeoutMs: 10_000,
});

async function loadOpenRouterModels(apiKey: string, signal: AbortSignal) {
  const pages = await modelsListForUser(client, { bearer: apiKey }, undefined, { signal });
  const models: OpenRouterCatalogModel[] = [];

  for await (const page of pages) {
    if (!page.ok) {
      throw page.error;
    }

    models.push(...page.value.result.data);
  }

  return models;
}

function normalizeTokenPricing(
  id: string,
  { prompt, completion, discount = 0 }: OpenRouterCatalogModel["pricing"],
) {
  const inputUsdPerToken = Number(prompt);
  const outputUsdPerToken = Number(completion);

  if (
    !prompt.trim() ||
    !completion.trim() ||
    !Number.isFinite(inputUsdPerToken) ||
    !Number.isFinite(outputUsdPerToken) ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 1
  ) {
    throw new TypeError(`OpenRouter model "${id}" has invalid pricing.`);
  }

  if (inputUsdPerToken === -1 || outputUsdPerToken === -1) {
    return undefined;
  }

  const multiplier = (1 - discount) * 1_000_000;
  const inputUsdPerMillion = inputUsdPerToken * multiplier;
  const outputUsdPerMillion = outputUsdPerToken * multiplier;

  if (
    !Number.isFinite(inputUsdPerMillion) ||
    inputUsdPerMillion < 0 ||
    !Number.isFinite(outputUsdPerMillion) ||
    outputUsdPerMillion < 0
  ) {
    throw new TypeError(`OpenRouter model "${id}" has invalid pricing.`);
  }

  return { inputUsdPerMillion, outputUsdPerMillion };
}

function normalizeContextWindow(id: string, contextLength: number | null) {
  if (contextLength === null) {
    return undefined;
  }

  return requireContextWindowTokens(contextLength, `OpenRouter model "${id}" context window`);
}

function normalizeModel({ contextLength, id, name, pricing, reasoning }: OpenRouterCatalogModel) {
  const separator = id.indexOf("/");
  let authorId = "";

  if (separator > 0) {
    authorId = id.slice(0, separator).replace(/^~+/, "").trim().toLowerCase();
  }

  if (!authorId || !id.slice(separator + 1).trim()) {
    throw new TypeError(`OpenRouter returned an invalid model identity "${id}".`);
  }

  const authorIdentity = resolveModelAuthor(authorId);
  const brandId = authorIdentity.brandId;
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new TypeError(`OpenRouter model "${id}" has no name.`);
  }

  const displayName = removeKnownAuthorPrefix(trimmedName, authorId, authorIdentity);

  if (!displayName) {
    throw new TypeError(`OpenRouter model "${id}" has no name.`);
  }

  const contextWindowTokens = normalizeContextWindow(id, contextLength);
  const tokenPricing = normalizeTokenPricing(id, pricing);
  const normalizedReasoning = normalizeOpenRouterReasoning(id, reasoning);
  return createProviderModel({
    brandId,
    id,
    name: displayName,
    contextWindowTokens,
    reasoning: normalizedReasoning,
    tokenPricing,
  });
}

export function createOpenRouterModels(
  configuration: Pick<ApiKeyConfiguration, "withApiKey">,
  loadModels: LoadOpenRouterModels = loadOpenRouterModels,
): ProviderModelsAdapter {
  return {
    list: (signal) =>
      configuration.withApiKey(async (apiKey) =>
        (await loadModels(apiKey, signal))
          .filter(
            ({ architecture }) =>
              architecture.inputModalities.includes("text") &&
              architecture.outputModalities.includes("text"),
          )
          .map(normalizeModel),
      ),
  };
}
