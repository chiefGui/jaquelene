import { Outlet, createFileRoute } from "@tanstack/react-router";
import { campaignPagesQuery } from "@/feature/campaign/query";
import { CampaignsSidebar } from "@/feature/campaign/sidebar";

export const Route = createFileRoute("/campaigns")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(campaignPagesQuery),
  staticData: { primarySidebar: CampaignsSidebar },
  component: Outlet,
});
