import { Button } from "@jaquelene/ui";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import { ContentPane } from "../../layout/content-pane";
import { Breadcrumb } from "../../primitive/breadcrumb";
import { scenarioIpc } from "../../feature/scenario/ipc";

export const Route = createFileRoute("/scenarios/$scenarioId")({
  loader: ({ params }) => scenarioIpc.get(params.scenarioId),
  remountDeps: ({ params }) => params.scenarioId,
  component: ScenarioRoute,
});

function ScenarioRoute() {
  const scenario = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  async function renameScenario(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scenario) {
      return;
    }

    const title = new FormData(event.currentTarget).get("title");

    if (typeof title !== "string") {
      setError("Enter a scenario title.");
      return;
    }

    setRenaming(true);
    setError(null);

    try {
      const result = await scenarioIpc.rename(scenario.id, title);

      if (result.status === "empty-title") {
        setError("Enter a scenario title.");
        return;
      }

      if (result.status === "not-found") {
        setError("This scenario no longer exists.");
        return;
      }

      try {
        await router.invalidate();
      } catch (cause) {
        console.error("The scenario was renamed, but the page could not refresh.", cause);
        setError("The scenario was renamed, but the page could not refresh.");
      }
    } catch (cause) {
      console.error("Could not rename the scenario.", cause);
      setError("Could not rename the scenario.");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item>
              <Breadcrumb.Link
                render={<Link to="/" />}
                className="text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
              >
                Home
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
        <div className="mx-auto w-full max-w-2xl p-6">
          {scenario ? (
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
                    aria-describedby={error ? "rename-scenario-error" : undefined}
                    className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-sm outline-none focus:border-muted"
                  />
                  <Button type="submit" disabled={renaming}>
                    {renaming ? "Saving…" : "Save"}
                  </Button>
                </div>
                {error ? (
                  <p id="rename-scenario-error" role="alert" className="mt-2 text-sm text-danger">
                    {error}
                  </p>
                ) : null}
              </form>
            </section>
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
