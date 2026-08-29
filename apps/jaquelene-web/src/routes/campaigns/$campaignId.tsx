import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { defaultCampaignModelQuery } from "@/feature/campaign/preferences";
import { campaignQuery } from "@/feature/campaign/query";
import { scenariosQuery } from "@/feature/scenario/query";
import { ScenariosSidebar } from "@/feature/scenario/sidebar";
import { threadMessagesQuery } from "@/feature/thread/query";
import { ThreadView } from "@/feature/thread/thread-view";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context, params }) => {
    const campaignPromise = context.queryClient.query({
      ...campaignQuery(params.campaignId),
      staleTime: "static",
    });

    await Promise.all([
      campaignPromise,
      context.queryClient.query({ ...scenariosQuery, staleTime: "static" }),
      context.queryClient.query(defaultCampaignModelQuery),
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
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);
  const { data: defaultModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const scenario = campaign ? scenarios.find(({ id }) => id === campaign.scenarioId) : undefined;

  if (campaign && !scenario) {
    throw new Error(`Campaign "${campaign.id}" references an unavailable scenario.`);
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/scenarios" />}>Scenarios</Breadcrumb.Link>
            </Breadcrumb.Item>
            {scenario ? (
              <>
                <Breadcrumb.Separator />
                <Breadcrumb.Item style={styles.breadcrumbItem}>
                  <Breadcrumb.Link
                    render={
                      <Link to="/scenarios/$scenarioId" params={{ scenarioId: scenario.id }} />
                    }
                    style={styles.breadcrumbLink}
                  >
                    {scenario.title}
                  </Breadcrumb.Link>
                </Breadcrumb.Item>
              </>
            ) : null}
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Page>Campaign</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport style={campaign ? styles.threadViewport : undefined}>
        {campaign ? (
          <ThreadView threadId={campaign.threadId} model={defaultModel} />
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
    </>
  );
}

const styles = stylex.create({
  breadcrumbItem: {
    minWidth: 0,
  },
  breadcrumbLink: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
