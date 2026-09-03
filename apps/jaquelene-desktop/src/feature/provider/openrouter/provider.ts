import { defineApiKeyProvider } from "../api-key-provider";
import { createOpenRouterGeneration } from "./generation";
import { createOpenRouterModels } from "./models";
import { verifyOpenRouterApiKey } from "./verification";

export const openRouterProviderId = "openrouter";

export const openRouterProviderDefinition = defineApiKeyProvider({
  descriptor: {
    id: openRouterProviderId,
    name: "OpenRouter",
    brandId: openRouterProviderId,
  },
  apiKeyPrefixes: ["sk-or-v1-"],
  verifyApiKey: verifyOpenRouterApiKey,
  createModels: createOpenRouterModels,
  createGeneration: createOpenRouterGeneration,
});
