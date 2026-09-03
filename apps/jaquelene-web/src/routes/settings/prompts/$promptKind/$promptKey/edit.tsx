import { promptKeySchema, promptKindKeySchema } from "@jaquelene/domain";
import { PromptOrigin } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { promptKindsQuery, promptQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/settings/prompts/$promptKind/$promptKey/edit")({
  loader: async ({ context, params }) => {
    const promptKind = promptKindKeySchema.safeParse(params.promptKind);
    const promptKey = promptKeySchema.safeParse(params.promptKey);

    if (!promptKind.success || !promptKey.success) {
      return null;
    }

    const [kinds, prompt] = await Promise.all([
      context.queryClient.query(promptKindsQuery),
      context.queryClient.query(promptQuery(promptKey.data)),
    ]);
    const registered = kinds.some((kind) => kind.key === promptKind.data);

    return registered && prompt?.kind === promptKind.data ? prompt : null;
  },
  remountDeps: ({ params }) => [params.promptKind, params.promptKey],
  component: EditPromptRoute,
});

const pageHeadingId = "edit-prompt-page";

function EditPromptRoute() {
  const prompt = Route.useLoaderData();
  const navigate = useNavigate({
    from: "/settings/prompts/$promptKind/$promptKey/edit",
  });

  function openPrompts() {
    return navigate({ to: "/settings/prompts", replace: true });
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/settings/prompts" replace />}>
                Prompts
              </Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>{prompt?.title ?? "Prompt"}</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page
                id={pageHeadingId}
                aria-label={prompt ? `Edit ${prompt.title}` : "Edit prompt"}
              >
                Edit
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          {prompt?.origin === PromptOrigin.Custom ? (
            <PromptEditor
              aria-labelledby={pageHeadingId}
              prompt={prompt}
              onCancel={() => void openPrompts()}
              onSaved={openPrompts}
            />
          ) : (
            <EmptyState.Root>
              <EmptyState.Title>{prompt ? "Built-in prompt" : "Prompt not found"}</EmptyState.Title>
              <EmptyState.Description>
                {prompt ? "Built-in prompts can’t be edited." : "It may have been deleted."}
              </EmptyState.Description>
              <Button render={<Link to="/settings/prompts" replace />} style={styles.returnAction}>
                Back to prompts
              </Button>
            </EmptyState.Root>
          )}
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  returnAction: { marginTop: "0.75rem" },
});
