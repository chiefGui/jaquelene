import { composeCampaignGenerationConfiguration } from "@jaquelene/domain";
import PanelRightCloseIcon from "@hugeicons/core-free-icons/PanelRightCloseIcon";
import PanelRightOpenIcon from "@hugeicons/core-free-icons/PanelRightOpenIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
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
  campaignRoleplayInstructionKeyQuery,
  instructionGroupsQuery,
} from "@/feature/instruction/query";
import { scenariosQuery } from "@/feature/scenario/query";
import { ScenariosSidebar } from "@/feature/scenario/sidebar";
import { threadMessagesQuery } from "@/feature/thread/query";
import { ThreadView } from "@/feature/thread/thread-view";
import { ContentPane } from "@/layout/content-pane";
import { SecondarySidebar } from "@/layout/secondary-sidebar";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context, params }) => {
    const campaignPromise = context.queryClient.query({
      ...campaignQuery(params.campaignId),
      staleTime: "static",
    });

    await Promise.all([
      campaignPromise,
      context.queryClient.query(campaignUsageQuery(params.campaignId)),
      context.queryClient.query({ ...scenariosQuery, staleTime: "static" }),
      context.queryClient.query(defaultCampaignModelQuery),
      context.queryClient.query(modelProvidersQuery),
      context.queryClient.query(instructionGroupsQuery),
      context.queryClient.query(campaignRoleplayInstructionKeyQuery(params.campaignId)),
      campaignPromise.then((result) =>
        result
          ? context.queryClient.infiniteQuery(threadMessagesQuery(result.threadId))
          : undefined,
      ),
    ]);
  },
  remountDeps: ({ params }) => params.campaignId,
  staticData: {
    primarySidebar: ScenariosSidebar,
  },
  component: CampaignRoute,
});

function CampaignRoute() {
  const { campaignId } = Route.useParams();
  const { data: campaign } = useSuspenseQuery(campaignQuery(campaignId));
  const { data: usage } = useSuspenseQuery(campaignUsageQuery(campaignId));
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);
  const { data: defaultModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const defaultModelPending = useIsDefaultCampaignModelPending();
  const generationPreferencesPending = useIsCampaignGenerationPreferencesPending(campaignId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scenario = campaign ? scenarios.find(({ id }) => id === campaign.scenarioId) : undefined;
  const effectiveConfiguration = composeCampaignGenerationConfiguration(
    defaultModel,
    campaign?.generationPreferences,
  );
  const effectiveConfigurationPending =
    generationPreferencesPending ||
    (campaign?.generationPreferences?.model === undefined && defaultModelPending);

  if (campaign && !scenario) {
    throw new Error(`Campaign "${campaign.id}" references an unavailable scenario.`);
  }

  if (campaign && !usage) {
    throw new Error(`Campaign "${campaign.id}" has no usage snapshot.`);
  }

  return (
    <SecondarySidebar.Root open={detailsOpen} setOpen={setDetailsOpen}>
      <ContentPane.Header style={styles.header}>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/scenarios" />}>Scenarios</Breadcrumb.Link>
            </Breadcrumb.Item>
            {scenario ? (
              <Breadcrumb.Item>
                <Breadcrumb.Link
                  render={<Link to="/scenarios/$scenarioId" params={{ scenarioId: scenario.id }} />}
                >
                  {scenario.title}
                </Breadcrumb.Link>
              </Breadcrumb.Item>
            ) : null}
            <Breadcrumb.Item>
              <Breadcrumb.Page>Campaign</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>

        {campaign ? (
          <SecondarySidebar.Trigger
            render={
              <IconButton
                aria-label={detailsOpen ? "Close campaign details" : "Open campaign details"}
              >
                <HugeiconsIcon
                  icon={detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </IconButton>
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

      {campaign && usage ? <CampaignDetailsSidebar campaignId={campaign.id} usage={usage} /> : null}
    </SecondarySidebar.Root>
  );
}

const styles = stylex.create({
  header: {
    gap: "0.5rem",
    justifyContent: "space-between",
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
});
