import type { ProviderAdapter } from "@jaquelene/backend";
import {
  createOpenRouterConfiguration,
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
