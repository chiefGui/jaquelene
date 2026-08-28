import { Button, Input, formatTimestamp } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
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
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/scenarios" />}>Scenarios</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item style={styles.breadcrumbItem}>
              <Breadcrumb.Page style={styles.breadcrumbPage}>
                {scenario?.title ?? "Scenario"}
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body style={styles.page}>
          {scenario ? (
            <>
              <section aria-labelledby="scenario-heading">
                <h1 id="scenario-heading" {...stylex.props(styles.title)}>
                  {scenario.title}
                </h1>
                <p {...stylex.props(styles.description)}>Rename this scenario.</p>

                <form {...stylex.props(styles.form)} onSubmit={renameScenario}>
                  <label htmlFor="scenario-title" {...stylex.props(styles.label)}>
                    Title
                  </label>
                  <div {...stylex.props(styles.fieldRow)}>
                    <Input
                      key={scenario.title}
                      id="scenario-title"
                      name="title"
                      type="text"
                      required
                      defaultValue={scenario.title}
                      aria-describedby={renameError ? "rename-scenario-error" : undefined}
                      style={styles.input}
                    />
                    <Button type="submit" disabled={renameScenarioMutation.isPending}>
                      {renameScenarioMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                  {renameError ? (
                    <p id="rename-scenario-error" role="alert" {...stylex.props(styles.error)}>
                      {renameError}
                    </p>
                  ) : null}
                </form>
              </section>

              <section aria-labelledby="campaigns-heading">
                <div {...stylex.props(styles.sectionHeader)}>
                  <h2 id="campaigns-heading" {...stylex.props(styles.sectionHeading)}>
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
                  <p id="start-campaign-error" role="alert" {...stylex.props(styles.error)}>
                    {campaignError}
                  </p>
                ) : null}

                {campaigns.length === 0 ? (
                  <p {...stylex.props(styles.empty)}>No campaigns yet.</p>
                ) : (
                  <ul {...stylex.props(styles.list)}>
                    {campaigns.map((campaign) => (
                      <li key={campaign.id} {...stylex.props(styles.listItem)}>
                        <Link
                          to="/campaigns/$campaignId"
                          params={{ campaignId: campaign.id }}
                          {...stylex.props(styles.listLink)}
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
              <h1 id="missing-scenario-heading" {...stylex.props(styles.title)}>
                Scenario not found
              </h1>
              <p {...stylex.props(styles.description)}>This scenario does not exist.</p>
            </section>
          )}
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  breadcrumbItem: {
    minWidth: 0,
  },
  breadcrumbPage: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  title: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    lineHeight: tokens.lineHeightLarge,
  },
  description: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.25rem",
  },
  form: {
    marginTop: "1.25rem",
  },
  label: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
  },
  fieldRow: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  error: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
  },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  sectionHeading: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
  },
  empty: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.75rem",
  },
  list: {
    borderColor: tokens.border,
    borderRadius: tokens.radiusLarge,
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "0.75rem",
    overflow: "hidden",
  },
  listItem: {
    borderColor: tokens.border,
    borderStyle: "solid",
    borderTopWidth: {
      default: 0,
      ":not(:first-child)": 1,
    },
  },
  listLink: {
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklab, ${tokens.accent} 10%, transparent)`,
    },
    display: "block",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    outlineColor: {
      default: null,
      ":focus-visible": `color-mix(in oklab, ${tokens.accent} 60%, transparent)`,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": -1,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
});
