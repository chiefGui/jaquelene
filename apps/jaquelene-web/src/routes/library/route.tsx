import AiFile01Icon from "@hugeicons/core-free-icons/AiFile01Icon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

function LibrarySidebar() {
  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Library",
        items: [
          {
            activeOptions: { exact: false },
            id: "narrator",
            icon: AiFile01Icon,
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
