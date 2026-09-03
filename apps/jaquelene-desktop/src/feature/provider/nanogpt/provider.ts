import { defineApiKeyProvider } from "../api-key-provider";
import { createNanoGptGeneration } from "./generation";
import { createNanoGptModels } from "./models";
import { verifyNanoGptApiKey } from "./verification";

export const nanoGptProviderId = "nanogpt";

export const nanoGptProviderDefinition = defineApiKeyProvider({
  descriptor: {
    id: nanoGptProviderId,
    name: "NanoGPT",
    brandId: nanoGptProviderId,
  },
  apiKeyPrefixes: ["sk-nano-"],
  verifyApiKey: verifyNanoGptApiKey,
  createModels: createNanoGptModels,
  createGeneration: createNanoGptGeneration,
});
