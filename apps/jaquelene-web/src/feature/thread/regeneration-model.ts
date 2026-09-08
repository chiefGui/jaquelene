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
  let model = defaultModel;
  let pending = defaultPending;
  if (sessionModel !== null) {
    model = sessionModel;
    pending = false;
  }

  let configuration: ModelConfigurationSelection | null = null;
  if (model !== null) {
    configuration = { model };
  }

  // Keep the opening's policy: adding a default cannot take over an inline
  // session choice, and an override of an existing default stays request-local.
  const rememberSelection = sessionModel !== null || defaultModel === null;
  return {
    configuration,
    pending,
    select(selectedModel) {
      if (rememberSelection) {
        remember(selectedModel);
      }
      return { model: selectedModel };
    },
  };
}
