import type {
  ProviderConfiguration,
  ProviderConfigureResult,
  ProviderSummary,
  Providers,
} from "@jaquelene/backend";
import {
  ProviderConfigurationKind,
  ProviderConfigurationState,
  ProviderConfigureState,
  Providers as ProvidersIpc,
  type Provider as IpcProvider,
  type ProviderConfiguration as IpcConfiguration,
  type ProviderConfigureResult as IpcConfigureResult,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcConfiguration(configuration: ProviderConfiguration): IpcConfiguration {
  switch (configuration.kind) {
    case "none":
      return {
        kind: ProviderConfigurationKind.None,
        state: ProviderConfigurationState.Configured,
      };
    case "api-key":
      return {
        kind: ProviderConfigurationKind.ApiKey,
        state:
          configuration.state === "configured"
            ? ProviderConfigurationState.Configured
            : ProviderConfigurationState.Unconfigured,
        ...(configuration.state === "configured" ? { keyLabel: configuration.keyLabel } : {}),
      };
  }
}

function toIpcProvider(provider: ProviderSummary): IpcProvider {
  return {
    id: provider.id,
    name: provider.name,
    brandId: provider.brandId,
    configuration: toIpcConfiguration(provider.configuration),
  };
}

function toIpcConfigureResult(result: ProviderConfigureResult): IpcConfigureResult {
  switch (result.state) {
    case "configured":
      return {
        state: ProviderConfigureState.Configured,
        keyLabel: result.keyLabel,
      };
    case "rejected":
      return { state: ProviderConfigureState.Rejected };
    case "unavailable":
      return { state: ProviderConfigureState.Unavailable };
  }
}

export function exposeProviders(target: WebFrameMain, providers: Providers) {
  ProvidersIpc.for(target).setImplementation({
    list: () => providers.list().map(toIpcProvider),
    async configureApiKey(providerId, apiKey) {
      return toIpcConfigureResult(await providers.configureApiKey(providerId, apiKey));
    },
    clearConfiguration: providers.clearConfiguration,
  });
}
