import { scenarioPromptKindKey } from "@jaquelene/domain";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/library/scenarios/new")({ component: NewScenarioRoute });

function NewScenarioRoute() {
  const navigate = useNavigate({ from: "/library/scenarios/new" });
  return (
    <>
      <ContentPane.Header>
        <ContentPane.Back
          render={<Link to="/library/scenarios" replace />}
          aria-label="Back to scenarios"
        />
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Link to="/library/scenarios">Scenarios</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page id="new-scenario-page">New</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>
          <PromptEditor
            aria-labelledby="new-scenario-page"
            kind={scenarioPromptKindKey}
            onCancel={() => navigate({ to: "/library/scenarios", replace: true })}
            onSaved={(prompt) =>
              navigate({
                to: "/library/scenarios/$promptKey/edit",
                params: { promptKey: prompt.key },
                replace: true,
              })
            }
          />
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}
