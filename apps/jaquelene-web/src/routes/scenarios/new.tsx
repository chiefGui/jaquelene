import { Button, Input } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import type { Scenario } from "@/feature/scenario/ipc";
import { useCreateScenario } from "@/feature/scenario/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/scenarios/new")({
  component: NewScenarioRoute,
});

type CreateScenarioError = {
  message: string;
  titleInvalid?: true;
};

const emptyTitleError = {
  message: "Enter a scenario title.",
  titleInvalid: true,
} satisfies CreateScenarioError;

function NewScenarioRoute() {
  const createScenarioMutation = useCreateScenario();
  const navigate = useNavigate({ from: "/scenarios/new" });
  const active = useRef(true);
  const titleInput = useRef<HTMLInputElement>(null);
  const [createdScenario, setCreatedScenario] = useState<Scenario | null>(null);
  const [error, setError] = useState<CreateScenarioError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pending && error?.titleInvalid) {
      titleInput.current?.focus();
    }
  }, [error, pending]);

  async function openScenario(scenario: Scenario) {
    try {
      await navigate({
        to: "/scenarios/$scenarioId",
        params: { scenarioId: scenario.id },
      });
    } catch (cause) {
      if (!active.current) {
        return;
      }

      reportError("scenario.open-created", cause);
      setError({ message: "The scenario was created, but it could not be opened." });
    }
  }

  async function createScenario(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      let scenario = createdScenario;

      if (!scenario) {
        const title = new FormData(event.currentTarget).get("title");

        if (typeof title !== "string") {
          setError(emptyTitleError);
          return;
        }

        const result = await createScenarioMutation.mutateAsync(title);

        if (!active.current) {
          return;
        }

        if (result.status === "empty-title") {
          setError(emptyTitleError);
          return;
        }

        scenario = result.scenario;
        setCreatedScenario(scenario);
      }

      await openScenario(scenario);
    } catch (cause) {
      reportError("scenario.create", cause);

      if (active.current) {
        setError({ message: "Could not create the scenario." });
      }
    } finally {
      if (active.current) {
        setPending(false);
      }
    }
  }

  let actionLabel = "Create scenario";

  if (createdScenario) {
    actionLabel = pending ? "Opening…" : "Open scenario";
  } else if (pending) {
    actionLabel = "Creating…";
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
            <Breadcrumb.Item>
              <Breadcrumb.Page id="create-scenario-page">Create scenario</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <form aria-labelledby="create-scenario-page" onSubmit={createScenario}>
            <label htmlFor="new-scenario-title" {...stylex.props(styles.label)}>
              Title
            </label>
            <div {...stylex.props(styles.fieldRow)}>
              <Input
                ref={titleInput}
                id="new-scenario-title"
                name="title"
                type="text"
                required
                autoFocus
                disabled={pending || Boolean(createdScenario)}
                aria-describedby={error?.titleInvalid ? "create-scenario-error" : undefined}
                aria-invalid={error?.titleInvalid || undefined}
                style={styles.input}
                placeholder="Scenario title"
              />
              <Button type="submit" disabled={pending}>
                {actionLabel}
              </Button>
            </div>

            {error ? (
              <p id="create-scenario-error" role="alert" {...stylex.props(styles.error)}>
                {error.message}
              </p>
            ) : null}
          </form>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
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
});
