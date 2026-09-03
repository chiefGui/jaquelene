import { PromptOrigin, narratorPromptKindKey, promptKeySchema } from "@jaquelene/domain";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { NarratorPromptManagement } from "@/feature/narrator/management";
import { PromptEditor } from "@/feature/prompt/editor";
import { PromptMetadata } from "@/feature/prompt/metadata";
import { promptDefaultQuery, promptKindsQuery, promptQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/narrator/$promptKey/edit")({
  loader: async ({ context, params }) => {
    const promptKey = promptKeySchema.safeParse(params.promptKey);

    if (!promptKey.success) {
      return null;
    }

    const [kinds, prompt] = await Promise.all([
      context.queryClient.query(promptKindsQuery),
      context.queryClient.query(promptQuery(promptKey.data)),
    ]);
    const registered = kinds.some((kind) => kind.key === narratorPromptKindKey);

    if (!registered || prompt?.kind !== narratorPromptKindKey) {
      return null;
    }

    if (prompt.origin === PromptOrigin.Custom) {
      await context.queryClient.query(promptDefaultQuery(narratorPromptKindKey));
    }

    return String(prompt.key);
  },
  remountDeps: ({ params }) => params.promptKey,
  component: EditPromptRoute,
});

const pageHeadingId = "edit-prompt-page";

function EditPromptRoute() {
  const promptKey = Route.useLoaderData();
  const promptResult = useQuery({
    ...promptQuery(promptKey ?? ""),
    enabled: promptKey !== null,
  });
  const prompt = promptResult.data;
  const navigate = useNavigate({
    from: "/library/narrator/$promptKey/edit",
  });
  const [deleted, setDeleted] = useState(false);

  function openNarrator() {
    return navigate({ to: "/library/narrator", replace: true });
  }

  function finishDeletion() {
    setDeleted(true);
    return openNarrator();
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
                aria-label={prompt ? `Edit ${prompt.title}` : "Edit prompt"}
              >
                {prompt?.title ?? "Prompt"}
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          {deleted ? (
            <EmptyState.Root>
              <EmptyState.Title>Prompt deleted</EmptyState.Title>
              <EmptyState.Description>Return to narrator to continue.</EmptyState.Description>
              <Button onClick={() => void openNarrator()} style={styles.returnAction}>
                Back to narrator
              </Button>
            </EmptyState.Root>
          ) : prompt?.origin === PromptOrigin.Custom ? (
            <div {...stylex.props(styles.editor)}>
              <PromptEditor aria-labelledby={pageHeadingId} prompt={prompt} />
              <NarratorPromptManagement prompt={prompt} onDeleted={finishDeletion} />
              <PromptMetadata prompt={prompt} />
            </div>
          ) : (
            <EmptyState.Root>
              <EmptyState.Title>{prompt ? "Built-in prompt" : "Prompt not found"}</EmptyState.Title>
              <EmptyState.Description>
                {prompt ? "Built-in prompts can't be edited." : "It may have been deleted."}
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
  editor: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  returnAction: { marginTop: "0.75rem" },
});
