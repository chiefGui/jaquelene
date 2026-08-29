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

function invalidateScenarioList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: scenariosQuery.queryKey, exact: true });
}

function cacheScenario(queryClient: QueryClient, scenario: Scenario) {
  queryClient.setQueryData(scenarioQuery(scenario.id).queryKey, scenario);
}

export function useCreateScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: scenarioIpc.create,
    onSuccess(result) {
      if (result.status === "empty-title") {
        return;
      }

      cacheScenario(queryClient, result.scenario);
      return invalidateScenarioList(queryClient);
    },
  });
}

export function useRenameScenario() {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: ({ id, title }: { id: string; title: string }) => scenarioIpc.rename(id, title),
    onSuccess(result, { id }) {
      if (result.status === "empty-title") {
        return;
      }

      if (result.status === "renamed") {
        cacheScenario(queryClient, result.scenario);
      } else {
        queryClient.setQueryData(scenarioQuery(id).queryKey, null);
      }

      return invalidateScenarioList(queryClient);
    },
  });
}
