import AiConcertIcon from "@hugeicons/core-free-icons/AiConcertIcon";
import { ScenarioIcon } from "@/primitive/icons";
import type { NavigationDestination } from "@/application/navigation";
import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

const narratorParentDestination = { to: "/library/narrator" } as const;

function LibrarySidebar() {
  const matchRoute = useMatchRoute();
  const narratorEditorActive = Boolean(
    matchRoute({ to: "/library/narrator/new" }) ||
    matchRoute({ to: "/library/narrator/$promptKey/edit" }),
  );
  const scenarioEditorActive = Boolean(
    matchRoute({ to: "/library/scenarios/new" }) ||
    matchRoute({ to: "/library/scenarios/$promptKey/edit" }),
  );
  let backDestination: NavigationDestination | undefined;
  if (narratorEditorActive) {
    backDestination = narratorParentDestination;
  } else if (scenarioEditorActive) {
    backDestination = { to: "/library/scenarios" };
  }

  return (
    <PrimarySidebar
      navigation={{
        ...(backDestination && { backDestination }),
        navigationLabel: "Library",
        items: [
          {
            activeOptions: { exact: false },
            id: "narrator",
            icon: AiConcertIcon,
            label: "Narrators",
            replace: true,
            to: "/library/narrator",
          },
          {
            activeOptions: { exact: false },
            id: "scenarios",
            icon: ScenarioIcon,
            label: "Scenarios",
            replace: true,
            to: "/library/scenarios",
          },
        ],
      }}
    />
  );
}

export const Route = createFileRoute("/library")({
  staticData: {
    primarySidebar: LibrarySidebar,
  },
  component: Outlet,
});
