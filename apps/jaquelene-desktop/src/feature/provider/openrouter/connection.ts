import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
} from "../api-key-configuration";
import { openRouterProviderId } from "./identity";

export type OpenRouterConfigurationDependencies = ApiKeyConfigurationDependencies;
export type OpenRouterConfiguration = ApiKeyConfiguration;

export function getOpenRouterConnectionStoragePaths(userDataDirectory: string) {
  return getApiKeyConfigurationStoragePaths(userDataDirectory, openRouterProviderId);
}

export function createOpenRouterConfiguration(
  userDataDirectory: string,
  dependencies: OpenRouterConfigurationDependencies,
): OpenRouterConfiguration {
  return createApiKeyConfiguration(
    userDataDirectory,
    { id: openRouterProviderId, name: "OpenRouter" },
    dependencies,
  );
}
