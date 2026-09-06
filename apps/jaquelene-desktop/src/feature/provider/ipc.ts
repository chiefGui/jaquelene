import type { ProviderSummary, Providers } from "@jaquelene/backend";
import { Providers as ProvidersIpc, type Provider as IpcProvider } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { Effect } from "effect";

type ProviderEffectRunner = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
) => Promise<Success>;

function toIpcProvider(provider: ProviderSummary): IpcProvider {
  return {
    id: provider.id,
    name: provider.name,
    brandId: provider.brandId,
    configuration: provider.configuration,
  };
}

export function exposeProviders(
  target: WebFrameMain,
  providers: Providers,
  runEffect: ProviderEffectRunner,
) {
  ProvidersIpc.for(target).setImplementation({
    list: () => providers.list().map(toIpcProvider),
    configureApiKey: (providerId, apiKey) =>
      runEffect(providers.configureApiKey(providerId, apiKey)),
    clearConfiguration: (providerId) => runEffect(providers.clearConfiguration(providerId)),
  });
}
