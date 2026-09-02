import {
  Form as AriakitForm,
  FormDescription,
  FormError,
  FormInput,
  FormLabel,
  useFormStore,
  useFormSubmit,
} from "@ariakit/react/form";
import { useStoreState } from "@ariakit/react/store";
import {
  SCENARIO_TITLE_MAX_LENGTH,
  SCENARIO_TITLE_MAX_UTF16_LENGTH,
  scenarioTitleInputSchema,
  type ScenarioTitleInput,
} from "@jaquelene/domain";
import { Button, Field, Form as FormLayout, Input, formatTimestamp } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { campaignsForScenarioQuery, useStartCampaign } from "@/feature/campaign/query";
import { useScenarioTitleFormValidation } from "@/feature/scenario/form";
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
  const renameForm = useFormStore({
    defaultValues: { title: scenario?.title ?? "" } satisfies ScenarioTitleInput,
  });
  const renameSubmitting = useStoreState(renameForm, "submitting");
  const renameSubmitted = useStoreState(
    renameForm,
    ["submitFailed", "submitSucceed"],
    (state) => state.submitFailed > 0 || state.submitSucceed > 0,
  );
  const [renameError, setRenameError] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  useScenarioTitleFormValidation(renameForm);
  useFormSubmit(renameForm, async (state) => {
    if (!scenario) {
      return;
    }

    try {
      const input = scenarioTitleInputSchema.parse(state.values);
      const renamed = await renameScenarioMutation.mutateAsync({
        id: scenario.id,
        title: input.title,
      });

      if (!renamed) {
        setRenameError("This scenario no longer exists.");
        return;
      }

      renameForm.setValue(renameForm.names.title, renamed.title);
    } catch (cause) {
      reportError("scenario.rename", cause);
      setRenameError("Could not rename the scenario.");
    }
  });

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
        reportError("campaign.open-started", cause);
        setCampaignError("The campaign was started, but it could not be opened.");
      }
    } catch (cause) {
      reportError("campaign.start", cause);
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
            <Breadcrumb.Item>
              <Breadcrumb.Page>{scenario?.title ?? "Scenario"}</Breadcrumb.Page>
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

                <AriakitForm
                  store={renameForm}
                  aria-busy={renameSubmitting || undefined}
                  onSubmit={() => setRenameError(null)}
                  render={<FormLayout.Root style={styles.form} />}
                  resetOnSubmit={false}
                  validateOnBlur={renameSubmitted}
                  validateOnChange={renameSubmitted}
                >
                  <Field.Root>
                    <FormLabel name={renameForm.names.title} render={<Field.Label />}>
                      Title
                    </FormLabel>
                    <FormDescription name={renameForm.names.title} render={<Field.Description />}>
                      Up to {SCENARIO_TITLE_MAX_LENGTH} characters.
                    </FormDescription>
                    <Field.Control>
                      <FormInput
                        name={renameForm.names.title}
                        render={
                          <Input
                            type="text"
                            disabled={renameSubmitting}
                            maxLength={SCENARIO_TITLE_MAX_UTF16_LENGTH}
                            style={styles.input}
                          />
                        }
                      />
                      <Button type="submit" disabled={renameSubmitting} style={styles.submitButton}>
                        {renameSubmitting ? "Saving…" : "Save"}
                      </Button>
                    </Field.Control>
                    <FormError name={renameForm.names.title} render={<Field.Error />} />
                  </Field.Root>

                  <FormLayout.Status
                    role={renameError ? "alert" : undefined}
                    tone={renameError ? "danger" : "neutral"}
                  >
                    {renameError}
                  </FormLayout.Status>
                </AriakitForm>
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
    maxWidth: "34rem",
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
  submitButton: {
    minWidth: "4.5rem",
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
