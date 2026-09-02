import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { AppShell } from "@/layout/app-shell";
import { PrimarySidebar } from "@/layout/primary-sidebar";

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
            id: "campaigns",
            icon: BookOpen01Icon,
            label: "Campaigns",
            to: "/campaigns",
          },
        ],
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.query(userInterfacePreferencesQuery),
  staticData: {
    primarySidebar: HomeSidebar,
  },
  component: AppShell,
});
