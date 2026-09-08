import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  readSessionRegenerationModel,
  rememberRegenerationModel,
  resolveRegenerationModel,
  subscribeToSessionRegenerationModel,
} from "./regeneration-model";
import {
  defaultRegenerationModelQuery,
  useIsDefaultRegenerationModelPending,
} from "./regeneration-preferences";

export function useRegenerationModel() {
  const queryClient = useQueryClient();
  const { data: defaultModel } = useSuspenseQuery(defaultRegenerationModelQuery);
  const defaultPending = useIsDefaultRegenerationModelPending();
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToSessionRegenerationModel(queryClient, onChange),
    [queryClient],
  );
  const getSnapshot = useCallback(() => readSessionRegenerationModel(queryClient), [queryClient]);
  const sessionModel = useSyncExternalStore(subscribe, getSnapshot);

  return useMemo(
    () =>
      resolveRegenerationModel(sessionModel, defaultModel, defaultPending, (model) =>
        rememberRegenerationModel(queryClient, model),
      ),
    [defaultModel, defaultPending, queryClient, sessionModel],
  );
}
