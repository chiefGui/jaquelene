import { narratorSkillKindKey } from "@jaquelene/domain";
import type { CustomSkill } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { SkillEditor } from "@/feature/skill/editor";
import { skillKindsQuery } from "@/feature/skill/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/narrator/new")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(skillKindsQuery);
    return kinds.find((kind) => kind.key === narratorSkillKindKey) ?? null;
  },
  component: NewSkillRoute,
});

const pageHeadingId = "new-prompt-page";

function NewSkillRoute() {
  const kind = Route.useLoaderData();
  const navigate = useNavigate({ from: "/library/narrator/new" });

  function openSkill(skill: CustomSkill) {
    return navigate({
      to: "/library/narrator/$skillKey/edit",
      params: { skillKey: skill.key },
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
            <SkillEditor
              aria-labelledby={pageHeadingId}
              kind={narratorSkillKindKey}
              onCancel={openNarrator}
              onSaved={openSkill}
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
