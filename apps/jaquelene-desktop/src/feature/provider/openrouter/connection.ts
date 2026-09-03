import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
} from "../api-key-configuration";
import { openRouterProviderDescriptor } from "./identity";

export type OpenRouterConfigurationDependencies = ApiKeyConfigurationDependencies;
export type OpenRouterConfiguration = ApiKeyConfiguration;

export function getOpenRouterConnectionStoragePaths(userDataDirectory: string) {
  return getApiKeyConfigurationStoragePaths(userDataDirectory, openRouterProviderDescriptor.id);
}

export function createOpenRouterConfiguration(
  userDataDirectory: string,
  dependencies: OpenRouterConfigurationDependencies,
): OpenRouterConfiguration {
  return createApiKeyConfiguration(
    userDataDirectory,
    {
      id: openRouterProviderDescriptor.id,
      name: openRouterProviderDescriptor.name,
      apiKeyPrefixes: ["sk-or-v1-"],
    },
    dependencies,
  );
}
