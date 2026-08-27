import { Button } from "@jaquelene/ui";
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
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">Scenarios</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
          <section aria-labelledby="create-scenario-heading">
            <h1 id="create-scenario-heading" className="text-lg font-semibold tracking-tight">
              Scenarios
            </h1>
            <p className="mt-1 text-sm text-muted">Create a scenario to get started.</p>

            <form className="mt-5" onSubmit={createScenario}>
              <label htmlFor="new-scenario-title" className="text-sm font-medium">
                Title
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="new-scenario-title"
                  name="title"
                  type="text"
                  required
                  aria-describedby={error ? "create-scenario-error" : undefined}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-muted"
                  placeholder="Scenario title"
                />
                <Button type="submit" disabled={createScenarioMutation.isPending}>
                  {createScenarioMutation.isPending ? "Creating…" : "Create scenario"}
                </Button>
              </div>
              {error ? (
                <p id="create-scenario-error" role="alert" className="mt-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </form>
          </section>

          <section aria-labelledby="scenario-list-heading">
            <h2 id="scenario-list-heading" className="text-sm font-medium">
              Your scenarios
            </h2>

            {scenarios.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No scenarios yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                {scenarios.map((scenario) => (
                  <li key={scenario.id}>
                    <Link
                      to="/scenarios/$scenarioId"
                      params={{ scenarioId: scenario.id }}
                      className="block px-4 py-3 text-sm transition-colors hover:bg-canvas focus-visible:-outline-offset-1 focus-visible:outline-1 focus-visible:outline-muted"
                    >
                      {scenario.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
