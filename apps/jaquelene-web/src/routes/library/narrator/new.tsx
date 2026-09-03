import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { narratorPromptKind, promptKindsQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/narrator/new")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(promptKindsQuery);
    return kinds.find((kind) => kind.key === narratorPromptKind) ?? null;
  },
  component: NewPromptRoute,
});

const pageHeadingId = "new-prompt-page";

function NewPromptRoute() {
  const kind = Route.useLoaderData();
  const navigate = useNavigate({ from: "/library/narrator/new" });

  function openNarrator() {
    return navigate({ to: "/library/narrator", replace: true });
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Link render={<Link to="/library/narrator" replace />}>
                Narrator
              </Breadcrumb.Link>
            </Breadcrumb.Item>
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
              kind={narratorPromptKind}
              onCancel={() => void openNarrator()}
              onSaved={openNarrator}
            />
          ) : (
            <EmptyState.Root>
              <EmptyState.Title>Narrator unavailable</EmptyState.Title>
              <EmptyState.Description>
                Narrator prompts aren't available right now.
              </EmptyState.Description>
              <Button render={<Link to="/library/narrator" replace />} style={styles.returnAction}>
                Back to narrator
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
