import type { Campaign } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { QueryErrorResetBoundary, useSuspenseQuery } from "@tanstack/react-query";
import { Component, Suspense, type ReactNode } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ContentPane } from "@/layout/content-pane";
import { EmptyState } from "@/primitive/empty-state";
import { CampaignDetails, CampaignDetailsSkeleton } from "./details";
import { campaignUsageQuery } from "./usage-query";

class DetailsErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    reportError("campaign.details.load", error);
  }

  override render() {
    if (this.state.failed) {
      return (
        <ContentPane.AsideViewport>
          <ContentPane.AsideBody render={<EmptyState.Root role="alert" />}>
            <EmptyState.Title>Couldn't load details</EmptyState.Title>
            <Button
              variant="ghost"
              onClick={() => {
                this.props.onReset();
                this.setState({ failed: false });
              }}
            >
              Retry
            </Button>
          </ContentPane.AsideBody>
        </ContentPane.AsideViewport>
      );
    }

    return this.props.children;
  }
}

function DetailsContent({ campaign }: { campaign: Campaign }) {
  const { data: usage } = useSuspenseQuery(campaignUsageQuery(campaign.id));
  if (!usage) throw new Error(`Campaign "${campaign.id}" has no usage snapshot.`);
  return <CampaignDetails campaign={campaign} usage={usage} />;
}

export function CampaignDetailsPanel({ campaign }: { campaign: Campaign }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <DetailsErrorBoundary onReset={reset}>
          <Suspense fallback={<CampaignDetailsSkeleton />}>
            <DetailsContent campaign={campaign} />
          </Suspense>
        </DetailsErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
