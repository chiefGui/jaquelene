import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { CampaignSidebar } from "@/feature/campaign/sidebar";
import { AppShell } from "@/layout/app-shell";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.query(userInterfacePreferencesQuery),
  staticData: {
    primarySidebar: CampaignSidebar,
  },
  component: AppShell,
});
