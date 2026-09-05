import Idea01Icon from "@hugeicons/core-free-icons/Idea01Icon";
import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

const narratorParentDestination = { to: "/library/narrator" } as const;

function LibrarySidebar() {
  const matchRoute = useMatchRoute();
  const narratorEditorActive = Boolean(
    matchRoute({ to: "/library/narrator/new" }) ||
    matchRoute({ to: "/library/narrator/$skillKey/edit" }),
  );

  return (
    <PrimarySidebar
      navigation={{
        ...(narratorEditorActive ? { backDestination: narratorParentDestination } : {}),
        navigationLabel: "Library",
        items: [
          {
            activeOptions: { exact: false },
            id: "narrator",
            icon: Idea01Icon,
            label: "Narrator",
            replace: true,
            to: "/library/narrator",
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
