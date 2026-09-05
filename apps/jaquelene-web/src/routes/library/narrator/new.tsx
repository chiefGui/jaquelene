import { narratorPromptActionTarget, narratorPromptKindKey } from "@jaquelene/domain";
import type { CustomPrompt } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { promptKindsQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/narrator/new")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(promptKindsQuery);
    return kinds.find((kind) => kind.key === narratorPromptKindKey) ?? null;
  },
  component: NewPromptRoute,
});

const pageHeadingId = "new-prompt-page";

function NewPromptRoute() {
  const kind = Route.useLoaderData();
  const navigate = useNavigate({ from: "/library/narrator/new" });

  function openPrompt(prompt: CustomPrompt) {
    return navigate({
      to: "/library/narrator/$promptKey/edit",
      params: { promptKey: prompt.key },
      replace: true,
    });
  }

  function openNarrator() {
    return navigate({ to: "/library/narrator", replace: true });
  }

  return (
    <>
      <ContentPane.Header>
        <ContentPane.Back
          render={<Link to="/library/narrator" replace />}
          aria-label="Back to narrator"
        />

        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Link to="/library/narrator">Narrator</Breadcrumb.Link>
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
              aiActionTarget={narratorPromptActionTarget}
              aria-labelledby={pageHeadingId}
              kind={narratorPromptKindKey}
              onCancel={openNarrator}
              onSaved={openPrompt}
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
