import { PromptOrigin, promptKeySchema, scenarioPromptKindKey } from "@jaquelene/domain";
import { Button, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptDeleteAction } from "@/feature/prompt/delete-action";
import { PromptEditor } from "@/feature/prompt/editor";
import { PromptMetadata } from "@/feature/prompt/metadata";
import { promptQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/scenarios/$promptKey/edit")({
  loader: async ({ context, params }) => {
    const key = promptKeySchema.safeParse(params.promptKey);
    if (!key.success) {
      return null;
    }
    const prompt = await context.queryClient.query(promptQuery(key.data));
    if (prompt?.kind !== scenarioPromptKindKey || prompt.origin !== PromptOrigin.Custom) {
      return null;
    }
    return String(prompt.key);
  },
  remountDeps: ({ params }) => params.promptKey,
  component: EditScenarioRoute,
});

function EditScenarioRoute() {
  const key = Route.useLoaderData();
  const { data: prompt } = useQuery({ ...promptQuery(key ?? ""), enabled: key !== null });
  const navigate = useNavigate({ from: "/library/scenarios/$promptKey/edit" });
  let content = (
    <EmptyState.Root>
      <EmptyState.Title>Scenario not found</EmptyState.Title>
      <EmptyState.Description>It may have been deleted.</EmptyState.Description>
      <Button variant="ghost" render={<Link to="/library/scenarios" replace />}>
        Back to scenarios
      </Button>
    </EmptyState.Root>
  );
  if (prompt?.kind === scenarioPromptKindKey && prompt.origin === PromptOrigin.Custom) {
    content = (
      <div {...stylex.props(styles.editor)}>
        <PromptEditor aria-labelledby="edit-scenario-page" prompt={prompt} />
        <Item.Group>
          <Item.Root>
            <Item.Content>
              <Item.Label>Delete</Item.Label>
              <Item.Description>Permanently remove this library scenario.</Item.Description>
            </Item.Content>
            <PromptDeleteAction
              prompt={prompt}
              description="Campaigns that copied this scenario keep their text. This can't be undone."
              onDeleted={() => navigate({ to: "/library/scenarios", replace: true })}
            />
          </Item.Root>
        </Item.Group>
        <PromptMetadata prompt={prompt} />
      </div>
    );
  }
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
              <Breadcrumb.Page id="edit-scenario-page">
                {prompt?.title ?? "Scenario"}
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>{content}</ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  editor: { display: "flex", flexDirection: "column", gap: "1.5rem" },
});
