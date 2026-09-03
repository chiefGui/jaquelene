import { promptKindKeySchema } from "@jaquelene/domain";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { promptKindsQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/settings/prompts/$promptKind/new")({
  loader: async ({ context, params }) => {
    const promptKind = promptKindKeySchema.safeParse(params.promptKind);

    if (!promptKind.success) {
      return null;
    }

    const kinds = await context.queryClient.query(promptKindsQuery);
    return kinds.find((kind) => kind.key === promptKind.data) ?? null;
  },
  remountDeps: ({ params }) => params.promptKind,
  component: NewPromptRoute,
});

const pageHeadingId = "new-prompt-page";

function NewPromptRoute() {
  const kind = Route.useLoaderData();
  const navigate = useNavigate({ from: "/settings/prompts/$promptKind/new" });

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
            <Breadcrumb.Item>{kind?.name ?? "Prompt kind"}</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page
                id={pageHeadingId}
                aria-label={kind ? `New ${kind.name} prompt` : "New prompt"}
              >
                New
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          {kind ? (
            <PromptEditor
              aria-labelledby={pageHeadingId}
              kind={kind.key}
              onCancel={() => void openPrompts()}
              onSaved={openPrompts}
            />
          ) : (
            <EmptyState.Root>
              <EmptyState.Title>Prompt kind unavailable</EmptyState.Title>
              <EmptyState.Description>
                Return to prompts and choose an available kind.
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
