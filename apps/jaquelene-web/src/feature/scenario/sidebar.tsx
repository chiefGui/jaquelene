import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import Books01Icon from "@hugeicons/core-free-icons/Books01Icon";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PrimarySidebar, type PrimarySidebarComponentProps } from "@/layout/primary-sidebar";
import { scenariosQuery } from "./query";

export function ScenariosSidebar(props: PrimarySidebarComponentProps) {
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);

  return (
    <PrimarySidebar
      {...props}
      navigation={{
        navigationLabel: "Scenarios",
        items: [
          {
            id: "back",
            icon: ArrowLeft01Icon,
            label: "Back",
            to: "/",
          },
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
      }}
    />
  );
}
