import { Button, Input } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import { scenariosQuery, useCreateScenario } from "@/feature/scenario/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/scenarios/")({
  component: ScenariosIndexRoute,
});

function ScenariosIndexRoute() {
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);
  const createScenarioMutation = useCreateScenario();
  const navigate = useNavigate({ from: "/scenarios/" });
  const [error, setError] = useState<string | null>(null);

  async function createScenario(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const title = new FormData(form).get("title");

    if (typeof title !== "string") {
      setError("Enter a scenario title.");
      return;
    }

    setError(null);

    try {
      const result = await createScenarioMutation.mutateAsync(title);

      if (result.status === "empty-title") {
        setError("Enter a scenario title.");
        return;
      }

      try {
        await navigate({
          to: "/scenarios/$scenarioId",
          params: { scenarioId: result.scenario.id },
        });
      } catch (cause) {
        console.error("The scenario was created, but it could not be opened.", cause);
        setError("The scenario was created, but it could not be opened.");
      }
    } catch (cause) {
      console.error("Could not create the scenario.", cause);
      setError("Could not create the scenario.");
    }
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Scenarios</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body style={styles.page}>
          <section aria-labelledby="create-scenario-heading">
            <h1 id="create-scenario-heading" {...stylex.props(styles.title)}>
              Scenarios
            </h1>
            <p {...stylex.props(styles.description)}>Create a scenario to get started.</p>

            <form {...stylex.props(styles.form)} onSubmit={createScenario}>
              <label htmlFor="new-scenario-title" {...stylex.props(styles.label)}>
                Title
              </label>
              <div {...stylex.props(styles.fieldRow)}>
                <Input
                  id="new-scenario-title"
                  name="title"
                  type="text"
                  required
                  aria-describedby={error ? "create-scenario-error" : undefined}
                  style={styles.input}
                  placeholder="Scenario title"
                />
                <Button type="submit" disabled={createScenarioMutation.isPending}>
                  {createScenarioMutation.isPending ? "Creating…" : "Create scenario"}
                </Button>
              </div>
              {error ? (
                <p id="create-scenario-error" role="alert" {...stylex.props(styles.error)}>
                  {error}
                </p>
              ) : null}
            </form>
          </section>

          <section aria-labelledby="scenario-list-heading">
            <h2 id="scenario-list-heading" {...stylex.props(styles.sectionHeading)}>
              Your scenarios
            </h2>

            {scenarios.length === 0 ? (
              <p {...stylex.props(styles.empty)}>No scenarios yet.</p>
            ) : (
              <ul {...stylex.props(styles.list)}>
                {scenarios.map((scenario) => (
                  <li key={scenario.id} {...stylex.props(styles.listItem)}>
                    <Link
                      to="/scenarios/$scenarioId"
                      params={{ scenarioId: scenario.id }}
                      {...stylex.props(styles.listLink)}
                    >
                      {scenario.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
