import type { ProviderSummary, Providers } from "@jaquelene/backend";
import { Providers as ProvidersIpc, type Provider as IpcProvider } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcProvider(provider: ProviderSummary): IpcProvider {
  return {
    id: provider.id,
    name: provider.name,
    brandId: provider.brandId,
    configuration: provider.configuration,
  };
}

export function exposeProviders(target: WebFrameMain, providers: Providers) {
  ProvidersIpc.for(target).setImplementation({
    list: () => providers.list().map(toIpcProvider),
    configureApiKey: providers.configureApiKey,
    clearConfiguration: providers.clearConfiguration,
  });
}
