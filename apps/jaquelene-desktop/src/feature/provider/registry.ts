import type { HttpClient } from "effect/unstable/http";
import {
  createApiKeyProviderFactory,
  type ApiKeyCredentialProtection,
  type ApiKeyProviderDefinition,
} from "./api-key-provider";
import { nanoGptProviderDefinition } from "./nanogpt/provider";
import { openRouterProviderDefinition } from "./openrouter/provider";

const apiKeyProviderDefinitions = [
  openRouterProviderDefinition,
  nanoGptProviderDefinition,
] as const satisfies readonly ApiKeyProviderDefinition[];

export function createProviderFactories(
  userDataDirectory: string,
  credentialProtection: ApiKeyCredentialProtection,
  client: HttpClient.HttpClient,
) {
  return apiKeyProviderDefinitions.map((definition) =>
    createApiKeyProviderFactory(userDataDirectory, definition, credentialProtection, client),
  );
}
