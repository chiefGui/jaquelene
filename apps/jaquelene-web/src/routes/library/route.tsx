import AiFile01Icon from "@hugeicons/core-free-icons/AiFile01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

function LibrarySidebar() {
  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Library",
        items: [
          {
            action: "history-back",
            id: "back",
            icon: ArrowLeft01Icon,
            label: "Back",
          },
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
