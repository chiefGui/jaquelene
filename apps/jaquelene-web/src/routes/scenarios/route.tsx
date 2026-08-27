import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import Books01Icon from "@hugeicons/core-free-icons/Books01Icon";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { scenariosQuery } from "../../feature/scenario/query";
import { PrimarySidebar } from "../../layout/primary-sidebar";

export const Route = createFileRoute("/scenarios")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(scenariosQuery);
  },
  staticData: {
    primarySidebar: ScenariosSidebar,
  },
  component: Outlet,
});

function ScenariosSidebar() {
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);

  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Scenarios",
        items: [
          {
            id: "all-scenarios",
            icon: Books01Icon,
            label: "All scenarios",
            to: "/scenarios",
          },
          ...scenarios.map((scenario) => ({
            id: scenario.id,
            icon: Book01Icon,
            label: scenario.title,
            to: "/scenarios/$scenarioId" as const,
            params: { scenarioId: scenario.id },
          })),
        ],
        action: {
          icon: ArrowLeft01Icon,
          label: "Back to home",
          to: "/",
        },
      }}
    />
  );
}
