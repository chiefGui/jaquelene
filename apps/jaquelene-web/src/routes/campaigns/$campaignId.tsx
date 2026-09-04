import { composeCampaignGenerationConfiguration, narratorPromptKindKey } from "@jaquelene/domain";
import PanelRightCloseIcon from "@hugeicons/core-free-icons/PanelRightCloseIcon";
import PanelRightOpenIcon from "@hugeicons/core-free-icons/PanelRightOpenIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton, Skeleton } from "@jaquelene/ui";
import { radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CampaignGenerationControls } from "@/feature/campaign/generation-controls";
import {
  defaultCampaignModelQuery,
  useIsDefaultCampaignModelPending,
} from "@/feature/campaign/preferences";
import { campaignQuery, useIsCampaignGenerationPreferencesPending } from "@/feature/campaign/query";
import { campaignUsageQuery } from "@/feature/campaign/usage-query";
import { CampaignDetailsSidebar } from "@/feature/campaign/details-sidebar";
import { modelProvidersQuery } from "@/feature/model/catalog-query";
import {
  campaignPromptSelectionQuery,
  promptDefaultQuery,
  promptPagesQuery,
  promptQuery,
} from "@/feature/prompt/query";
import { threadMessagesQuery } from "@/feature/thread/query";
import { ThreadView } from "@/feature/thread/thread-view";
import { threadLayout } from "@/feature/thread/thread-layout.stylex";
import { ContentPane } from "@/layout/content-pane";
import { SecondarySidebar } from "@/layout/secondary-sidebar";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context, params }) => {
    const campaignPromise = context.queryClient.query({
      ...campaignQuery(params.campaignId),
      staleTime: "static",
    });
    const narratorSelectionPromise = context.queryClient.query(
      campaignPromptSelectionQuery(params.campaignId, narratorPromptKindKey),
    );

    await Promise.all([
      campaignPromise,
      context.queryClient.query(campaignUsageQuery(params.campaignId)),
      context.queryClient.query(defaultCampaignModelQuery),
      context.queryClient.query(modelProvidersQuery),
      context.queryClient.query(promptDefaultQuery(narratorPromptKindKey)),
      context.queryClient.infiniteQuery({
        ...promptPagesQuery(narratorPromptKindKey),
        staleTime: "static",
      }),
      narratorSelectionPromise,
      narratorSelectionPromise.then((selection) =>
        selection?.effectivePromptKey
          ? context.queryClient.query(promptQuery(selection.effectivePromptKey))
          : undefined,
      ),
      campaignPromise.then((result) =>
        result
          ? context.queryClient.infiniteQuery(threadMessagesQuery(result.threadId))
          : undefined,
      ),
    ]);
  },
  remountDeps: ({ params }) => params.campaignId,
  pendingComponent: CampaignPending,
  pendingMs: 0,
  pendingMinMs: 0,
  component: CampaignRoute,
});

function CampaignPending() {
  return (
    <>
      <ContentPane.Header>
        <Skeleton style={styles.pendingTitle} />
      </ContentPane.Header>

      <ContentPane.Viewport style={styles.threadViewport}>
        <section
          role="status"
          aria-label="Loading campaign"
          aria-busy="true"
          {...stylex.props(styles.pendingThread)}
        >
          <div {...stylex.props(threadLayout.column, threadLayout.gutter, styles.pendingMessages)}>
            <div {...stylex.props(styles.pendingMessage)}>
              <Skeleton style={styles.pendingLineLong} />
              <Skeleton style={styles.pendingLineMedium} />
            </div>
            <div {...stylex.props(styles.pendingMessage, styles.pendingUserMessage)}>
              <Skeleton style={styles.pendingLineMedium} />
              <Skeleton style={styles.pendingLineShort} />
            </div>
            <div {...stylex.props(styles.pendingMessage)}>
              <Skeleton style={styles.pendingLineLong} />
              <Skeleton style={styles.pendingLineShort} />
            </div>
          </div>

          <div {...stylex.props(threadLayout.column, threadLayout.gutter, styles.pendingControls)}>
            <Skeleton style={styles.pendingComposer} />
          </div>
        </section>
      </ContentPane.Viewport>
    </>
  );
}

function CampaignRoute() {
  const { campaignId } = Route.useParams();
  const { data: campaign } = useSuspenseQuery(campaignQuery(campaignId));
  const { data: usage } = useSuspenseQuery(campaignUsageQuery(campaignId));
  const { data: defaultModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const defaultModelPending = useIsDefaultCampaignModelPending();
  const generationPreferencesPending = useIsCampaignGenerationPreferencesPending(campaignId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const effectiveConfiguration = composeCampaignGenerationConfiguration(
    defaultModel,
    campaign?.generationPreferences,
  );
  const effectiveConfigurationPending =
    generationPreferencesPending ||
    (campaign?.generationPreferences?.model === undefined && defaultModelPending);

  if (campaign && !usage) {
    throw new Error(`Campaign "${campaign.id}" has no usage snapshot.`);
  }

  return (
    <SecondarySidebar.Root open={detailsOpen} setOpen={setDetailsOpen}>
      <ContentPane.Header>
        <ContentPane.HistoryBack />

        <Breadcrumb.Root style={styles.breadcrumb}>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>{campaign?.title ?? "Campaign"}</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>

        {campaign ? (
          <SecondarySidebar.Trigger
            render={
              <IconButton.Root
                aria-label={detailsOpen ? "Close campaign details" : "Open campaign details"}
              >
                <IconButton.Icon
                  render={
                    <HugeiconsIcon icon={detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon} />
                  }
                />
              </IconButton.Root>
            }
          />
        ) : null}
      </ContentPane.Header>

      <ContentPane.Viewport style={campaign ? styles.threadViewport : undefined}>
        {campaign ? (
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
        ) : (
          <ContentPane.Body>
            <section aria-labelledby="missing-campaign-heading">
              <h1 id="missing-campaign-heading" {...stylex.props(styles.title)}>
                Campaign not found
              </h1>
            </section>
          </ContentPane.Body>
        )}
      </ContentPane.Viewport>

      {campaign && usage ? <CampaignDetailsSidebar campaign={campaign} usage={usage} /> : null}
    </SecondarySidebar.Root>
  );
}

const styles = stylex.create({
  breadcrumb: {
    flexGrow: 1,
    marginInlineEnd: "0.5rem",
  },
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
  pendingTitle: {
    height: "0.75rem",
    width: "9rem",
  },
  pendingThread: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  pendingMessages: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "1.5rem",
    justifyContent: "flex-end",
    paddingBlock: "1.5rem",
  },
  pendingMessage: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    width: "78%",
  },
  pendingUserMessage: {
    alignSelf: "flex-end",
    width: "62%",
  },
  pendingLineLong: {
    height: "0.75rem",
    width: "100%",
  },
  pendingLineMedium: {
    height: "0.75rem",
    width: "72%",
  },
  pendingLineShort: {
    height: "0.75rem",
    width: "46%",
  },
  pendingControls: {
    paddingBlockEnd: "1.5rem",
  },
  pendingComposer: {
    borderRadius: radii.control,
    height: "7rem",
    width: "100%",
  },
});
