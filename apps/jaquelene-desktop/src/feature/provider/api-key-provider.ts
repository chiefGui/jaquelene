import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFactory,
  ProviderGenerationAdapter,
  ProviderModelsAdapter,
} from "@jaquelene/backend";
import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
} from "./api-key-configuration";

export type ApiKeyCredentialProtection = Pick<
  ApiKeyConfigurationDependencies,
  "decrypt" | "encrypt"
>;

export type ApiKeyProviderDefinition = Readonly<{
  descriptor: ProviderDescriptor;
  apiKeyPrefixes: readonly string[];
  verifyApiKey: ApiKeyConfigurationDependencies["verify"];
  createModels: (configuration: ApiKeyConfiguration) => ProviderModelsAdapter;
  createGeneration: (configuration: ApiKeyConfiguration) => ProviderGenerationAdapter;
}>;

function createApiKeyProvider(
  userDataDirectory: string,
  definition: ApiKeyProviderDefinition,
  credentialProtection: ApiKeyCredentialProtection,
): ProviderAdapter {
  const { descriptor } = definition;
  const configuration = createApiKeyConfiguration(
    userDataDirectory,
    {
      id: descriptor.id,
      name: descriptor.name,
      apiKeyPrefixes: definition.apiKeyPrefixes,
    },
    {
      ...credentialProtection,
      verify: definition.verifyApiKey,
    },
  );

  return {
    descriptor,
    configuration,
    models: definition.createModels(configuration),
    generation: definition.createGeneration(configuration),
  };
}

export function createApiKeyProviderFactory(
  userDataDirectory: string,
  definition: ApiKeyProviderDefinition,
  credentialProtection: ApiKeyCredentialProtection,
): ProviderFactory {
  return {
    id: definition.descriptor.id,
    storagePaths: getApiKeyConfigurationStoragePaths(userDataDirectory, definition.descriptor.id),
    create(signal) {
      signal.throwIfAborted();
      return createApiKeyProvider(userDataDirectory, definition, credentialProtection);
    },
  };
}
