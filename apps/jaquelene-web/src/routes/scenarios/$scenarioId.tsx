import { Button, formatTimestamp } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import { campaignsForScenarioQuery, useStartCampaign } from "@/feature/campaign/query";
import { scenarioQuery, useRenameScenario } from "@/feature/scenario/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/scenarios/$scenarioId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({
        ...scenarioQuery(params.scenarioId),
        staleTime: "static",
      }),
      context.queryClient.query({
        ...campaignsForScenarioQuery(params.scenarioId),
        staleTime: "static",
      }),
    ]);
  },
  remountDeps: ({ params }) => params.scenarioId,
  component: ScenarioRoute,
});

function ScenarioRoute() {
  const { scenarioId } = Route.useParams();
  const { data: scenario } = useSuspenseQuery(scenarioQuery(scenarioId));
  const { data: campaigns } = useSuspenseQuery(campaignsForScenarioQuery(scenarioId));
  const renameScenarioMutation = useRenameScenario();
  const startCampaignMutation = useStartCampaign();
  const navigate = useNavigate({ from: "/scenarios/$scenarioId" });
  const [renameError, setRenameError] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  async function renameScenario(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scenario) {
      return;
    }

    const title = new FormData(event.currentTarget).get("title");

    if (typeof title !== "string") {
      setRenameError("Enter a scenario title.");
      return;
    }

    setRenameError(null);

    try {
      const result = await renameScenarioMutation.mutateAsync({ id: scenario.id, title });

      if (result.status === "empty-title") {
        setRenameError("Enter a scenario title.");
        return;
      }

      if (result.status === "not-found") {
        setRenameError("This scenario no longer exists.");
        return;
      }
    } catch (cause) {
      console.error("Could not rename the scenario.", cause);
      setRenameError("Could not rename the scenario.");
    }
  }

  async function startCampaign() {
    if (!scenario) {
      return;
    }

    setCampaignError(null);

    try {
      const campaign = await startCampaignMutation.mutateAsync(scenario.id);

      try {
        await navigate({
          to: "/campaigns/$campaignId",
          params: { campaignId: campaign.id },
        });
      } catch (cause) {
        console.error("The campaign was started, but it could not be opened.", cause);
        setCampaignError("The campaign was started, but it could not be opened.");
      }
    } catch (cause) {
      console.error("Could not start the campaign.", cause);
      setCampaignError("Could not start the campaign.");
    }
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item>
              <Breadcrumb.Link
                render={<Link to="/scenarios" />}
                className="text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
              >
                Scenarios
              </Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item className="min-w-0">
              <Breadcrumb.Page className="block truncate font-medium text-foreground">
                {scenario?.title ?? "Scenario"}
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
          {scenario ? (
            <>
              <section aria-labelledby="scenario-heading">
                <h1 id="scenario-heading" className="text-lg font-semibold tracking-tight">
                  {scenario.title}
                </h1>
                <p className="mt-1 text-sm text-muted">Rename this scenario.</p>

                <form className="mt-5" onSubmit={renameScenario}>
                  <label htmlFor="scenario-title" className="text-sm font-medium">
                    Title
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      key={scenario.title}
                      id="scenario-title"
                      name="title"
                      type="text"
                      required
                      defaultValue={scenario.title}
                      aria-describedby={renameError ? "rename-scenario-error" : undefined}
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-muted"
                    />
                    <Button type="submit" disabled={renameScenarioMutation.isPending}>
                      {renameScenarioMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                  {renameError ? (
                    <p id="rename-scenario-error" role="alert" className="mt-2 text-sm text-danger">
                      {renameError}
                    </p>
                  ) : null}
                </form>
              </section>

              <section aria-labelledby="campaigns-heading">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="campaigns-heading" className="text-sm font-medium">
                    Campaigns
                  </h2>
                  <Button
                    type="button"
                    disabled={startCampaignMutation.isPending}
                    aria-describedby={campaignError ? "start-campaign-error" : undefined}
                    onClick={startCampaign}
                  >
                    {startCampaignMutation.isPending ? "Starting…" : "Start campaign"}
                  </Button>
                </div>

                {campaignError ? (
                  <p id="start-campaign-error" role="alert" className="mt-2 text-sm text-danger">
                    {campaignError}
                  </p>
                ) : null}

                {campaigns.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">No campaigns yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {campaigns.map((campaign) => (
                      <li key={campaign.id}>
                        <Link
                          to="/campaigns/$campaignId"
                          params={{ campaignId: campaign.id }}
                          className="block px-4 py-3 text-sm transition-colors hover:bg-canvas focus-visible:-outline-offset-1 focus-visible:outline-1 focus-visible:outline-muted"
                        >
                          <time dateTime={new Date(campaign.startedAt).toISOString()}>
                            {formatTimestamp(campaign.startedAt)}
                          </time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <section aria-labelledby="missing-scenario-heading">
              <h1 id="missing-scenario-heading" className="text-lg font-semibold tracking-tight">
                Scenario not found
              </h1>
              <p className="mt-1 text-sm text-muted">This scenario does not exist.</p>
            </section>
          )}
        </div>
      </ContentPane.Viewport>
    </>
  );
}
