import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import Books01Icon from "@hugeicons/core-free-icons/Books01Icon";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { PrimarySidebar } from "@/layout/primary-sidebar";
import { campaignPagesQuery } from "./query";

export function CampaignsSidebar() {
  const { data } = useSuspenseInfiniteQuery(campaignPagesQuery);
  const campaigns = data.pages.flatMap((page) => page.campaigns);

  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Campaigns",
        items: [
          {
            id: "back",
            icon: ArrowLeft01Icon,
            label: "Back",
            to: "/",
          },
          {
            id: "all-campaigns",
            icon: Books01Icon,
            label: "All campaigns",
            to: "/campaigns",
          },
          ...campaigns.map((campaign) => ({
            id: campaign.id,
            icon: Book01Icon,
            label: campaign.title,
            to: "/campaigns/$campaignId" as const,
            params: { campaignId: campaign.id },
          })),
        ],
      }}
    />
  );
}
