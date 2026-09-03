import {
  createApiKeyProviderFactory,
  type ApiKeyCredentialProtection,
  type ApiKeyProviderDefinition,
} from "./api-key-provider";
import { nanoGptProviderDefinition } from "./nanogpt/provider";
import { openRouterProviderDefinition } from "./openrouter/provider";

const providerDefinitions = [
  openRouterProviderDefinition,
  nanoGptProviderDefinition,
] satisfies readonly ApiKeyProviderDefinition[];

export function createProviderFactories(
  userDataDirectory: string,
  credentialProtection: ApiKeyCredentialProtection,
) {
  return providerDefinitions.map((definition) =>
    createApiKeyProviderFactory(userDataDirectory, definition, credentialProtection),
  );
}
