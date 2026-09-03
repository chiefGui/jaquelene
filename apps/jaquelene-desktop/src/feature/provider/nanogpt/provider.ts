import type { ProviderAdapter, ProviderFactory } from "@jaquelene/backend";
import {
  createNanoGptConfiguration,
  getNanoGptConnectionStoragePaths,
  type NanoGptConfigurationDependencies,
} from "./connection";
import { createNanoGptGeneration } from "./generation";
import { nanoGptProviderDescriptor, nanoGptProviderId } from "./identity";
import { createNanoGptModels } from "./models";

export { nanoGptProviderId } from "./identity";

export function createNanoGptProvider(
  userDataDirectory: string,
  dependencies: NanoGptConfigurationDependencies,
): ProviderAdapter {
  const configuration = createNanoGptConfiguration(userDataDirectory, dependencies);

  return {
    descriptor: nanoGptProviderDescriptor,
    configuration,
    models: createNanoGptModels(configuration),
    generation: createNanoGptGeneration(configuration),
  };
}

export function createNanoGptProviderFactory(
  userDataDirectory: string,
  dependencies: NanoGptConfigurationDependencies,
): ProviderFactory {
  return {
    id: nanoGptProviderId,
    storagePaths: getNanoGptConnectionStoragePaths(userDataDirectory),
    create(signal) {
      signal.throwIfAborted();
      return createNanoGptProvider(userDataDirectory, dependencies);
    },
  };
}
