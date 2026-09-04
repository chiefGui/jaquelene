import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PrimarySidebar } from "@/layout/primary-sidebar";
import { campaignPagesQuery } from "./query";

export function CampaignSidebar() {
  const pages = useInfiniteQuery(campaignPagesQuery);
  const campaigns = pages.data?.pages.flatMap((page) => page.campaigns) ?? [];
  const firstPageUnavailable = pages.isError && !pages.data;
  const trailingAction = firstPageUnavailable
    ? {
        label: pages.isFetching ? "Retrying…" : "Retry campaigns",
        onSelect: () => void pages.refetch(),
        pending: pages.isFetching,
      }
    : pages.hasNextPage
      ? {
          label: pages.isFetchingNextPage ? "Loading…" : "Load more",
          onSelect: () => void pages.fetchNextPage(),
          pending: pages.isFetchingNextPage,
        }
      : undefined;

  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Campaigns",
        items: [
          {
            id: "start-campaign",
            icon: Add01Icon,
            label: "Start campaign",
            to: "/campaigns/new",
          },
          ...campaigns.map((campaign) => ({
            id: campaign.id,
            icon: Book01Icon,
            label: campaign.title,
            to: "/campaigns/$campaignId" as const,
            params: { campaignId: campaign.id },
            activeOptions: { exact: false },
          })),
        ],
        ...(pages.isPending ? { loadingItemCount: 3 } : {}),
        ...(trailingAction ? { trailingAction } : {}),
      }}
    />
  );
}
