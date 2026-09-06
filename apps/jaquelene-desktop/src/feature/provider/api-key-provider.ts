import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFactory,
  ProviderGenerationAdapter,
  ProviderModelsAdapter,
} from "@jaquelene/backend";
import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import {
  createApiKeyConfiguration,
  getApiKeyConfigurationStoragePaths,
  type ApiKeyConfiguration,
  type ApiKeyConfigurationDependencies,
  type ApiKeyVerificationResult,
} from "./api-key-configuration";

export type ApiKeyCredentialProtection = Pick<
  ApiKeyConfigurationDependencies,
  "decrypt" | "encrypt"
>;

export type ApiKeyProviderDefinition = Readonly<{
  descriptor: ProviderDescriptor;
  apiKeyPrefixes: readonly string[];
  verifyApiKey: (
    apiKey: string,
    client: HttpClient.HttpClient,
  ) => Effect.Effect<ApiKeyVerificationResult, unknown>;
  createModels: (
    configuration: ApiKeyConfiguration,
    client: HttpClient.HttpClient,
  ) => ProviderModelsAdapter;
  createGeneration: (
    configuration: ApiKeyConfiguration,
    client: HttpClient.HttpClient,
  ) => ProviderGenerationAdapter;
}>;

function createApiKeyProvider(
  userDataDirectory: string,
  definition: ApiKeyProviderDefinition,
  credentialProtection: ApiKeyCredentialProtection,
  client: HttpClient.HttpClient,
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
      verify: (apiKey) => definition.verifyApiKey(apiKey, client),
    },
  );

  return {
    descriptor,
    configuration,
    models: definition.createModels(configuration, client),
    generation: definition.createGeneration(configuration, client),
  };
}

export function createApiKeyProviderFactory(
  userDataDirectory: string,
  definition: ApiKeyProviderDefinition,
  credentialProtection: ApiKeyCredentialProtection,
  client: HttpClient.HttpClient,
): ProviderFactory {
  return {
    id: definition.descriptor.id,
    storagePaths: getApiKeyConfigurationStoragePaths(userDataDirectory, definition.descriptor.id),
    create: Effect.try({
      try: () => createApiKeyProvider(userDataDirectory, definition, credentialProtection, client),
      catch: (cause) => cause,
    }),
  };
}
