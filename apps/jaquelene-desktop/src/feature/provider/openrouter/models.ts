import { modelsListResponseFromJSON } from "@openrouter/sdk/models";
import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
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

const modelPageSize = 500;

const loadOpenRouterPage = Effect.fn("OpenRouter.loadModelPage")(
  function* (apiKey: string, client: HttpClient.HttpClient, offset: number) {
    const response = yield* HttpClientRequest.get("https://openrouter.ai/api/v1/models/user").pipe(
      HttpClientRequest.bearerToken(apiKey),
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeader("X-OpenRouter-Title", "Jaquelene"),
      HttpClientRequest.setUrlParams({ offset, limit: modelPageSize }),
      HttpClient.withScope(client).execute,
    );
    const body = yield* response.text;

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new Error(`OpenRouter rejected the model request with status ${response.status}.`, {
          cause: body,
        }),
      );
    }

    const result = modelsListResponseFromJSON(body);

    if (!result.ok) {
      return yield* Effect.fail(result.error);
    }

    return result.value.data;
  },
  Effect.scoped,
  Effect.timeout(10_000),
);

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
  client: HttpClient.HttpClient,
): ProviderModelsAdapter {
  return {
    list: configuration.withApiKey(
      Effect.fnUntraced(function* (apiKey) {
        const models: OpenRouterCatalogModel[] = [];
        let offset = 0;

        while (true) {
          const page = yield* loadOpenRouterPage(apiKey, client, offset);
          models.push(...page);

          if (page.length < modelPageSize) {
            break;
          }

          offset += page.length;
        }

        return yield* Effect.try({
          try: () =>
            models
              .filter(
                ({ architecture }) =>
                  architecture.inputModalities.includes("text") &&
                  architecture.outputModalities.includes("text"),
              )
              .map(normalizeModel),
          catch: (cause) => cause,
        });
      }),
    ),
  };
}
