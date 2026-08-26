import { createFileRoute } from "@tanstack/react-router";
import { scenarioIpc } from "../../scenario/ipc";
import { ScenarioPage } from "../../scenario/scenario-page";

export const Route = createFileRoute("/scenarios/$scenarioId")({
  loader: ({ params }) => scenarioIpc.get(params.scenarioId),
  remountDeps: ({ params }) => params.scenarioId,
  component: ScenarioRoute,
});

function ScenarioRoute() {
  return <ScenarioPage scenario={Route.useLoaderData()} />;
}
