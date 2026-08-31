import type { ProviderAdapter, ProviderFactory } from "@jaquelene/backend";
import {
  createOpenRouterConfiguration,
  getOpenRouterConnectionStoragePaths,
  type OpenRouterConfigurationDependencies,
} from "./connection";
import { createOpenRouterGeneration } from "./generation";
import { openRouterProviderId } from "./identity";
import { createOpenRouterModels } from "./models";

export { openRouterProviderId } from "./identity";

export function createOpenRouterProvider(
  userDataDirectory: string,
  dependencies: OpenRouterConfigurationDependencies,
): ProviderAdapter {
  const configuration = createOpenRouterConfiguration(userDataDirectory, dependencies);

  return {
    descriptor: {
      id: openRouterProviderId,
      name: "OpenRouter",
      brandId: openRouterProviderId,
    },
    configuration,
    models: createOpenRouterModels(configuration),
    generation: createOpenRouterGeneration(configuration),
  };
}

export function createOpenRouterProviderFactory(
  userDataDirectory: string,
  dependencies: OpenRouterConfigurationDependencies,
): ProviderFactory {
  return {
    id: openRouterProviderId,
    storagePaths: getOpenRouterConnectionStoragePaths(userDataDirectory),
    create(signal) {
      signal.throwIfAborted();
      return createOpenRouterProvider(userDataDirectory, dependencies);
    },
  };
}
