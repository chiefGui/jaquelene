import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { CampaignSidebar } from "@/feature/campaign/sidebar";
import { AppShell } from "@/layout/app-shell";
import { markdownEditorPreferencesQuery } from "@/feature/markdown/preferences";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(userInterfacePreferencesQuery),
      context.queryClient.query(markdownEditorPreferencesQuery),
    ]),
  staticData: {
    primarySidebar: CampaignSidebar,
  },
  component: AppShell,
});
