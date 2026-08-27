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
};

type LoadOpenRouterModels = (apiKey: string) => Promise<readonly OpenRouterCatalogModel[]>;

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

export function createOpenRouterModelProvider(
  connection: Pick<OpenRouterConnection, "withApiKey">,
  loadModels: LoadOpenRouterModels = loadOpenRouterModels,
): ModelProvider {
  return {
    id: "openrouter",
    name: "OpenRouter",
    listModels: () =>
      connection.withApiKey(async (apiKey) =>
        (await loadModels(apiKey))
          .filter(
            ({ architecture }) =>
              architecture.inputModalities.includes("text") &&
              architecture.outputModalities.includes("text"),
          )
          .map(({ id, name }) => ({ id, name })),
      ),
  };
}
