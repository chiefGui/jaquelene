import { composeCampaignGenerationConfiguration } from "@jaquelene/domain";
import { tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CampaignDetailsPanel } from "@/feature/campaign/details-panel";
import { CampaignGenerationControls } from "@/feature/campaign/generation-controls";
import {
  defaultCampaignModelQuery,
  useIsDefaultCampaignModelPending,
} from "@/feature/campaign/preferences";
import { campaignQuery, useIsCampaignGenerationPreferencesPending } from "@/feature/campaign/query";
import { CampaignTitleControl } from "@/feature/campaign/title-control";
import { modelProvidersQuery } from "@/feature/model/catalog-query";
import { threadMessagesQuery } from "@/feature/thread/query";
import { ThreadView } from "@/feature/thread/thread-view";
import { ContentPane } from "@/layout/content-pane";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context, params }) => {
    const campaignPromise = context.queryClient.query({
      ...campaignQuery(params.campaignId),
      staleTime: "static",
    });
    await Promise.all([
      campaignPromise,
      context.queryClient.query(defaultCampaignModelQuery),
      context.queryClient.query(modelProvidersQuery),
      campaignPromise.then((result) => {
        if (result) {
          return context.queryClient.infiniteQuery(threadMessagesQuery(result.threadId));
        }
      }),
    ]);
  },
  remountDeps: ({ params }) => params.campaignId,
  component: CampaignRoute,
});

function CampaignRoute() {
  const { campaignId } = Route.useParams();
  const { data: campaign } = useSuspenseQuery(campaignQuery(campaignId));
  const { data: defaultModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const defaultModelPending = useIsDefaultCampaignModelPending();
  const generationPreferencesPending = useIsCampaignGenerationPreferencesPending(campaignId);
  const effectiveConfiguration = composeCampaignGenerationConfiguration(
    defaultModel,
    campaign?.generationPreferences,
  );
  const effectiveConfigurationPending =
    generationPreferencesPending ||
    (campaign?.generationPreferences?.model === undefined && defaultModelPending);

  if (!campaign) {
    return (
      <>
        <ContentPane.Header>
          <ContentPane.HistoryBack />
        </ContentPane.Header>
        <ContentPane.Viewport>
          <ContentPane.Body>
            <h1 {...stylex.props(styles.title)}>Campaign not found</h1>
          </ContentPane.Body>
        </ContentPane.Viewport>
      </>
    );
  }

  return (
    <ContentPane.Split>
      <ContentPane.Header layout="centered">
        <ContentPane.HeaderLeading>
          <ContentPane.HistoryBack />
        </ContentPane.HeaderLeading>
        <ContentPane.HeaderTitle>
          <CampaignTitleControl campaign={campaign} />
        </ContentPane.HeaderTitle>
        <ContentPane.HeaderTrailing>
          <ContentPane.AsideToggle label="campaign details" />
        </ContentPane.HeaderTrailing>
      </ContentPane.Header>

      <ContentPane.Viewport style={styles.threadViewport}>
        <ThreadView
          threadId={campaign.threadId}
          configuration={effectiveConfiguration}
          configurationPending={effectiveConfigurationPending}
          composerControls={
            <CampaignGenerationControls
              campaignId={campaign.id}
              defaultModel={defaultModel}
              configuration={effectiveConfiguration}
              disabled={defaultModelPending}
              preferences={campaign.generationPreferences}
            />
          }
        />
      </ContentPane.Viewport>
      <ContentPane.Aside aria-label="Campaign details">
        <CampaignDetailsPanel campaign={campaign} />
      </ContentPane.Aside>
    </ContentPane.Split>
  );
}

const styles = stylex.create({
  title: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    lineHeight: tokens.lineHeightLarge,
  },
  threadViewport: {
    display: "flex",
    overflow: "hidden",
  },
});
