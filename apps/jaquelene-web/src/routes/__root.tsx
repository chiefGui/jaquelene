import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { createRootRoute } from "@tanstack/react-router";
import { AppShell } from "../layout/app-shell";
import { PrimarySidebar } from "../layout/primary-sidebar";

function HomeSidebar() {
  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Home",
        items: [
          {
            id: "home",
            icon: Home01Icon,
            label: "Home",
            to: "/",
          },
          {
            id: "scenarios",
            icon: BookOpen01Icon,
            label: "Scenarios",
            to: "/scenarios",
          },
        ],
        action: {
          icon: Settings01Icon,
          label: "Settings",
          to: "/settings/general",
        },
      }}
    />
  );
}

export const Route = createRootRoute({
  staticData: {
    primarySidebar: HomeSidebar,
  },
  component: AppShell,
});
