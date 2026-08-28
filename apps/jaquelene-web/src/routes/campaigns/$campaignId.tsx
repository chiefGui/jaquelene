import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { campaignQuery } from "@/feature/campaign/query";
import { scenariosQuery } from "@/feature/scenario/query";
import { ScenariosSidebar } from "@/feature/scenario/sidebar";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/$campaignId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({
        ...campaignQuery(params.campaignId),
        staleTime: "static",
      }),
      context.queryClient.query({ ...scenariosQuery, staleTime: "static" }),
    ]);
  },
  staticData: {
    primarySidebar: ScenariosSidebar,
  },
  component: CampaignRoute,
});

function CampaignRoute() {
  const { campaignId } = Route.useParams();
  const { data: campaign } = useSuspenseQuery(campaignQuery(campaignId));
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);
  const scenario = campaign ? scenarios.find(({ id }) => id === campaign.scenarioId) : undefined;

  if (campaign && !scenario) {
    throw new Error(`Campaign "${campaign.id}" references an unavailable scenario.`);
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item>
              <Breadcrumb.Link
                render={<Link to="/scenarios" />}
                className="text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
              >
                Scenarios
              </Breadcrumb.Link>
            </Breadcrumb.Item>
            {scenario ? (
              <>
                <Breadcrumb.Separator className="text-muted" />
                <Breadcrumb.Item className="min-w-0">
                  <Breadcrumb.Link
                    render={
                      <Link to="/scenarios/$scenarioId" params={{ scenarioId: scenario.id }} />
                    }
                    className="block truncate text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
                  >
                    {scenario.title}
                  </Breadcrumb.Link>
                </Breadcrumb.Item>
              </>
            ) : null}
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">Campaign</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto w-full max-w-2xl p-6">
          {campaign ? (
            <h1 className="text-lg font-semibold tracking-tight">Campaign</h1>
          ) : (
            <section aria-labelledby="missing-campaign-heading">
              <h1 id="missing-campaign-heading" className="text-lg font-semibold tracking-tight">
                Campaign not found
              </h1>
            </section>
          )}
        </div>
      </ContentPane.Viewport>
    </>
  );
}
