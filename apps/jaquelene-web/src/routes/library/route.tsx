import AiConcertIcon from "@hugeicons/core-free-icons/AiConcertIcon";
import { textLibraries } from "@/feature/prompt/text-libraries";
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
  let backDestination: NavigationDestination | undefined;
  if (narratorEditorActive) {
    backDestination = narratorParentDestination;
  } else {
    const library = textLibraries.find(
      (library) => matchRoute({ to: library.newPath }) || matchRoute({ to: library.editPath }),
    );
    if (library) backDestination = { to: library.indexPath };
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
          ...textLibraries.map((library) => ({
            activeOptions: { exact: false },
            id: library.kind,
            icon: library.icon,
            label: library.plural,
            replace: true,
            to: library.indexPath,
          })),
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
