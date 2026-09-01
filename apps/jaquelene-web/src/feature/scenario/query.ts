import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions } from "@/ipc";
import { scenarioIpc, type Scenario } from "./ipc";

export const scenarioQueryKey = ["scenarios"] as const;

export const scenariosQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: scenarioQueryKey,
  queryFn: scenarioIpc.list,
});

export function scenarioQuery(id: string) {
  return queryOptions({
    ...ipcQueryOptions,
    queryKey: [...scenarioQueryKey, id],
    queryFn: () => scenarioIpc.get(id),
  });
}

function refreshScenarioList(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: scenariosQuery.queryKey, exact: true });
}

function cacheScenario(queryClient: QueryClient, scenario: Scenario) {
  queryClient.setQueryData(scenarioQuery(scenario.id).queryKey, scenario);
  queryClient.setQueryData<Scenario[]>(scenariosQuery.queryKey, (scenarios) => {
    if (!scenarios) {
      return scenarios;
    }

    const index = scenarios.findIndex(({ id }) => id === scenario.id);
    return index === -1 ? [...scenarios, scenario] : scenarios.with(index, scenario);
  });
}

function removeScenarioFromCache(queryClient: QueryClient, id: string) {
  queryClient.setQueryData(scenarioQuery(id).queryKey, null);
  queryClient.setQueryData<Scenario[]>(scenariosQuery.queryKey, (scenarios) =>
    scenarios?.filter((scenario) => scenario.id !== id),
  );
}

export function useCreateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: scenarioIpc.create,
    onSuccess(scenario) {
      cacheScenario(queryClient, scenario);
      refreshScenarioList(queryClient);
    },
  });
}

export function useRenameScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: scenarioIpc.rename,
    onSuccess(scenario, { id }) {
      if (scenario) {
        cacheScenario(queryClient, scenario);
      } else {
        removeScenarioFromCache(queryClient, id);
      }

      refreshScenarioList(queryClient);
    },
  });
}
