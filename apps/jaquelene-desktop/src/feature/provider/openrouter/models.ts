import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { modelsListForUser } from "@openrouter/sdk/funcs/modelsListForUser.js";
import type { ModelProvider } from "@/feature/model/catalog";
import type { OpenRouterConnection } from "./connection";

type OpenRouterCatalogModel = {
  id: string;
  name: string;
  architecture: {
    inputModalities: readonly string[];
    outputModalities: readonly string[];
  };
  pricing: {
    prompt: string;
    completion: string;
    discount?: number | undefined;
  };
};

type LoadOpenRouterModels = (apiKey: string) => Promise<readonly OpenRouterCatalogModel[]>;

type AuthorIdentity = {
  brandId: string;
  namePrefixes?: readonly string[];
};

const authorIdentities: ReadonlyMap<string, AuthorIdentity> = new Map([
  ["arcee-ai", { brandId: "arcee" }],
  ["bytedance-seed", { brandId: "bytedance" }],
  ["ibm-granite", { brandId: "ibm" }],
  ["meta-llama", { brandId: "meta" }],
  ["mistralai", { brandId: "mistral" }],
  ["moonshotai", { brandId: "moonshot" }],
  ["x-ai", { brandId: "x-ai", namePrefixes: ["SpaceXAI"] }],
]);

const client = new OpenRouterCore({
  appTitle: "Jaquelene",
  retryConfig: { strategy: "none" },
  timeoutMs: 10_000,
});

async function loadOpenRouterModels(apiKey: string) {
  const pages = await modelsListForUser(client, { bearer: apiKey });
  const models: OpenRouterCatalogModel[] = [];

  for await (const page of pages) {
    if (!page.ok) {
      throw page.error;
    }

    models.push(...page.value.result.data);
  }

  return models;
}

function normalizeIdentity(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
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

function normalizeModel({ id, name, pricing }: OpenRouterCatalogModel) {
  const separator = id.indexOf("/");
  const authorId =
    separator > 0 ? id.slice(0, separator).replace(/^~+/, "").trim().toLowerCase() : "";

  if (!authorId || !id.slice(separator + 1).trim()) {
    throw new TypeError(`OpenRouter returned an invalid model identity "${id}".`);
  }

  const authorIdentity = authorIdentities.get(authorId);
  const brandId = authorIdentity?.brandId ?? authorId;
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new TypeError(`OpenRouter model "${id}" has no name.`);
  }

  const nameSeparator = trimmedName.indexOf(":");
  const prefix = normalizeIdentity(trimmedName.slice(0, nameSeparator));
  const knownPrefixes = [authorId, brandId, ...(authorIdentity?.namePrefixes ?? [])].map(
    normalizeIdentity,
  );
  const hasBrandPrefix =
    nameSeparator > 0 && knownPrefixes.some((knownPrefix) => prefix === knownPrefix);
  const displayName = hasBrandPrefix ? trimmedName.slice(nameSeparator + 1).trim() : trimmedName;

  if (!displayName) {
    throw new TypeError(`OpenRouter model "${id}" has no name.`);
  }

  const tokenPricing = normalizeTokenPricing(id, pricing);

  return {
    brandId,
    id,
    name: displayName,
    ...(tokenPricing ? { tokenPricing } : {}),
  };
}

export function createOpenRouterModelProvider(
  connection: Pick<OpenRouterConnection, "getConfiguration" | "withApiKey">,
  loadModels: LoadOpenRouterModels = loadOpenRouterModels,
): ModelProvider {
  return {
    id: "openrouter",
    brandId: "openrouter",
    isConfigured: () => connection.getConfiguration().state === "configured",
    listModels: () =>
      connection.withApiKey(async (apiKey) =>
        (await loadModels(apiKey))
          .filter(
            ({ architecture }) =>
              architecture.inputModalities.includes("text") &&
              architecture.outputModalities.includes("text"),
          )
          .map(normalizeModel),
      ),
  };
}
