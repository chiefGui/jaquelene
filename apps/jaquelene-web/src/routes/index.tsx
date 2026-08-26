import { createFileRoute } from "@tanstack/react-router";
import { scenarioIpc } from "../scenario/ipc";
import { ScenariosPage } from "../scenario/scenarios-page";

export const Route = createFileRoute("/")({
  loader: () => scenarioIpc.list(),
  component: ScenariosRoute,
});

function ScenariosRoute() {
  return <ScenariosPage scenarios={Route.useLoaderData()} />;
}
