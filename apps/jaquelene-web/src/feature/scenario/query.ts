import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { scenarioIpc, type Scenario } from "./ipc";

const scenarioKey = ["scenarios"] as const;
const scenarioQueryDefaults = {
  networkMode: "always",
  retry: false,
  staleTime: Infinity,
} as const;

export const scenariosQuery = queryOptions({
  ...scenarioQueryDefaults,
  queryKey: scenarioKey,
  queryFn: scenarioIpc.list,
});

export function scenarioQuery(id: string) {
  return queryOptions({
    ...scenarioQueryDefaults,
    queryKey: [...scenarioKey, id],
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
    mutationFn: scenarioIpc.create,
    networkMode: "always",
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
    mutationFn: ({ id, title }: { id: string; title: string }) => scenarioIpc.rename(id, title),
    networkMode: "always",
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
