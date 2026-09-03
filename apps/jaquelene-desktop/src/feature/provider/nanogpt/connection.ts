import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
} from "../api-key-configuration";
import { nanoGptProviderDescriptor } from "./identity";

export type NanoGptConfigurationDependencies = ApiKeyConfigurationDependencies;
export type NanoGptConfiguration = ApiKeyConfiguration;

export function getNanoGptConnectionStoragePaths(userDataDirectory: string) {
  return getApiKeyConfigurationStoragePaths(userDataDirectory, nanoGptProviderDescriptor.id);
}

export function createNanoGptConfiguration(
  userDataDirectory: string,
  dependencies: NanoGptConfigurationDependencies,
): NanoGptConfiguration {
  return createApiKeyConfiguration(
    userDataDirectory,
    {
      id: nanoGptProviderDescriptor.id,
      name: nanoGptProviderDescriptor.name,
      apiKeyPrefixes: ["sk-nano-"],
    },
    dependencies,
  );
}
