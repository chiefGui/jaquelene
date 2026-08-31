import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { campaignContinuationQuery } from "@/feature/campaign/query";
import { AppShell } from "@/layout/app-shell";
import { PrimarySidebar, type PrimarySidebarComponentProps } from "@/layout/primary-sidebar";

function HomeSidebar(props: PrimarySidebarComponentProps) {
  return (
    <PrimarySidebar
      {...props}
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
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query(userInterfacePreferencesQuery),
      context.queryClient.query(campaignContinuationQuery),
    ]);
  },
  staticData: {
    primarySidebar: HomeSidebar,
  },
  component: AppShell,
});
