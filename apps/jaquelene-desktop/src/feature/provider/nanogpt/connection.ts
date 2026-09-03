import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
} from "../api-key-configuration";
import { nanoGptProviderId } from "./identity";

export type NanoGptConfigurationDependencies = ApiKeyConfigurationDependencies;
export type NanoGptConfiguration = ApiKeyConfiguration;

export function getNanoGptConnectionStoragePaths(userDataDirectory: string) {
  return getApiKeyConfigurationStoragePaths(userDataDirectory, nanoGptProviderId);
}

export function createNanoGptConfiguration(
  userDataDirectory: string,
  dependencies: NanoGptConfigurationDependencies,
): NanoGptConfiguration {
  return createApiKeyConfiguration(
    userDataDirectory,
    { id: nanoGptProviderId, name: "NanoGPT" },
    dependencies,
  );
}
