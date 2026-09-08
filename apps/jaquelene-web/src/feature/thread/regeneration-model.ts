import type { ModelConfigurationSelection, ModelSelection } from "@jaquelene/ipc/renderer";
import { skipToken, type QueryClient } from "@tanstack/react-query";

const sessionModelQueryKey = ["session", "regeneration", "model"] as const;

export function readSessionRegenerationModel(queryClient: QueryClient): ModelSelection | null {
  return queryClient.getQueryData<ModelSelection>(sessionModelQueryKey) ?? null;
}

export function rememberRegenerationModel(queryClient: QueryClient, model: ModelSelection) {
  const query = queryClient.getQueryCache().build<ModelSelection>(queryClient, {
    queryKey: sessionModelQueryKey,
    queryFn: skipToken,
    gcTime: Infinity,
  });
  query.setData({ ...model }, { manual: true });
}

export function subscribeToSessionRegenerationModel(
  queryClient: QueryClient,
  onChange: () => void,
) {
  return queryClient.getQueryCache().subscribe(({ query }) => {
    const key = query.queryKey;
    if (
      key.length === sessionModelQueryKey.length &&
      sessionModelQueryKey.every((part, index) => key[index] === part)
    ) {
      onChange();
    }
  });
}

export type RegenerationModelChoice = Readonly<{
  configuration: ModelConfigurationSelection | null;
  pending: boolean;
  select: (model: ModelSelection) => ModelConfigurationSelection;
}>;

export function resolveRegenerationModel(
  sessionModel: ModelSelection | null,
  defaultModel: ModelSelection | null,
  defaultPending: boolean,
  remember: (model: ModelSelection) => void,
): RegenerationModelChoice {
  const model = sessionModel ?? defaultModel;
  let configuration: ModelConfigurationSelection | null = null;
  if (model !== null) {
    configuration = { model };
  }

  const rememberSelection = sessionModel !== null || defaultModel === null;
  return {
    configuration,
    pending: sessionModel === null && defaultPending,
    select(selectedModel) {
      if (rememberSelection) {
        remember(selectedModel);
      }
      return { model: selectedModel };
    },
  };
}
