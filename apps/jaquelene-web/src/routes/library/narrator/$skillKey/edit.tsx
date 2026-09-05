import { SkillOrigin, narratorSkillKindKey, skillKeySchema } from "@jaquelene/domain";
import { Button } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { NarratorSkillManagement } from "@/feature/narrator/management";
import { SkillEditor } from "@/feature/skill/editor";
import { SkillMetadata } from "@/feature/skill/metadata";
import { skillDefaultQuery, skillKindsQuery, skillQuery } from "@/feature/skill/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export const Route = createFileRoute("/library/narrator/$skillKey/edit")({
  loader: async ({ context, params }) => {
    const skillKey = skillKeySchema.safeParse(params.skillKey);

    if (!skillKey.success) {
      return null;
    }

    const [kinds, skill] = await Promise.all([
      context.queryClient.query(skillKindsQuery),
      context.queryClient.query(skillQuery(skillKey.data)),
    ]);
    const registered = kinds.some((kind) => kind.key === narratorSkillKindKey);

    if (!registered || skill?.kind !== narratorSkillKindKey) {
      return null;
    }

    if (skill.origin === SkillOrigin.Custom) {
      await context.queryClient.query(skillDefaultQuery(narratorSkillKindKey));
    }

    return String(skill.key);
  },
  remountDeps: ({ params }) => params.skillKey,
  component: EditSkillRoute,
});

const pageHeadingId = "edit-prompt-page";

function EditSkillRoute() {
  const skillKey = Route.useLoaderData();
  const skillResult = useQuery({
    ...skillQuery(skillKey ?? ""),
    enabled: skillKey !== null,
  });
  const skill = skillResult.data;
  const navigate = useNavigate({
    from: "/library/narrator/$skillKey/edit",
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
                aria-label={skill ? `Edit ${skill.title}` : "Edit prompt"}
              >
                {skill?.title ?? "Skill"}
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
          ) : skill?.origin === SkillOrigin.Custom ? (
            <div {...stylex.props(styles.editor)}>
              <SkillEditor aria-labelledby={pageHeadingId} skill={skill} />
              <NarratorSkillManagement skill={skill} onDeleted={finishDeletion} />
              <SkillMetadata skill={skill} />
            </div>
          ) : (
            <EmptyState.Root>
              <EmptyState.Title>{skill ? "Built-in prompt" : "Prompt not found"}</EmptyState.Title>
              <EmptyState.Description>
                {skill ? "Built-in prompts can't be edited." : "It may have been deleted."}
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
