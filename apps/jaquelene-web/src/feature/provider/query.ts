import {
  ProviderConfigurationKind,
  ProviderConfigurationState,
  ProviderConfigureState,
} from "@jaquelene/domain";
import { Providers, type Provider } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { resetModelProvider } from "@/feature/model/catalog-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listProviders = requireIpcMethod(Providers?.list);
const configureProviderApiKey = requireIpcMethod(Providers?.configureApiKey);
const clearProviderConfiguration = requireIpcMethod(Providers?.clearConfiguration);

export const providersQuery = queryOptions({
  ...ipcQueryOptions,
  staleTime: Infinity,
  queryKey: ["providers"],
  queryFn: listProviders,
});

function updateProvider(
  providers: Provider[] | undefined,
  providerId: string,
  update: (provider: Provider) => Provider,
) {
  return providers?.map((provider) => {
    if (provider.id === providerId) {
      return update(provider);
    }

    return provider;
  });
}

export function useConfigureProviderApiKey(providerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: (apiKey: string) => configureProviderApiKey(providerId, apiKey),
    onSuccess(result) {
      if (result.state === ProviderConfigureState.Configured) {
        queryClient.setQueryData<Provider[]>(providersQuery.queryKey, (providers) =>
          updateProvider(providers, providerId, (provider) => ({
            ...provider,
            configuration: {
              kind: ProviderConfigurationKind.ApiKey,
              state: ProviderConfigurationState.Configured,
              keyLabel: result.keyLabel,
            },
          })),
        );
        return resetModelProvider(queryClient, providerId);
      }
    },
  });
}

export function useClearProviderConfiguration(providerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: () => clearProviderConfiguration(providerId),
    onSuccess() {
      queryClient.setQueryData<Provider[]>(providersQuery.queryKey, (providers) =>
        updateProvider(providers, providerId, (provider) => ({
          ...provider,
          configuration: {
            kind: ProviderConfigurationKind.ApiKey,
            state: ProviderConfigurationState.Unconfigured,
          },
        })),
      );
      return resetModelProvider(queryClient, providerId);
    },
  });
}
