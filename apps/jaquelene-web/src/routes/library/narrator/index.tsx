import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Bookmark02Icon from "@hugeicons/core-free-icons/Bookmark02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { SkillOrigin, narratorSkillKindKey } from "@jaquelene/domain";
import type { CustomSkill, Skill, SkillKind } from "@jaquelene/ipc/renderer";
import { Badge, Button, IconButton, Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { NarratorSkillDeleteAction } from "@/feature/narrator/delete-action";
import {
  skillDefaultQuery,
  skillKindsQuery,
  skillPagesQuery,
  useSetSkillDefault,
} from "@/feature/skill/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EditIcon } from "@/primitive/icons";

type SetSkillDefaultMutation = ReturnType<typeof useSetSkillDefault>;

export const Route = createFileRoute("/library/narrator/")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(skillKindsQuery);
    const kind = kinds.find(({ key }) => key === narratorSkillKindKey) ?? null;

    if (!kind) {
      return null;
    }

    await Promise.all([
      context.queryClient.query(skillDefaultQuery(narratorSkillKindKey)),
      context.queryClient.infiniteQuery(skillPagesQuery(narratorSkillKindKey)),
    ]);

    return kind;
  },
  component: NarratorRoute,
});

function NarratorSkillEditAction({ skill }: { skill: CustomSkill }) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        render={
          <IconButton.Root
            render={
              <Link
                to="/library/narrator/$skillKey/edit"
                params={{ skillKey: skill.key }}
                replace
              />
            }
            aria-label={`Edit ${skill.title}`}
            style={styles.skillAction}
          >
            <IconButton.Icon render={<HugeiconsIcon icon={EditIcon} />} />
          </IconButton.Root>
        }
      />
      <Tooltip>Edit</Tooltip>
    </Tooltip.Root>
  );
}

function NarratorSkillDefaultAction({
  defaultSkillKey,
  skill,
  setDefault,
}: {
  defaultSkillKey: string | undefined;
  skill: Skill;
  setDefault: SetSkillDefaultMutation;
}) {
  const displayedDefaultSkillKey = setDefault.isPending ? setDefault.variables : defaultSkillKey;
  const isDefault = skill.key === displayedDefaultSkillKey;
  const defaultPending = setDefault.isPending && setDefault.variables === skill.key;
  const defaultFailed = setDefault.isError && setDefault.variables === skill.key;
  const defaultTooltip = defaultFailed
    ? "Couldn't set default"
    : isDefault
      ? "Default"
      : "Set as default";

  function setAsDefault() {
    setDefault.reset();
    setDefault.mutate(skill.key, {
      onError(cause) {
        reportError("skill.default.update", cause);
      },
    });
  }

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Anchor
          render={
            <IconButton.Root
              type="button"
              aria-busy={defaultPending || undefined}
              aria-label={
                isDefault
                  ? `${skill.title} is the default narrator`
                  : `Set ${skill.title} as the default narrator`
              }
              aria-pressed={isDefault}
              disabled={isDefault || defaultPending}
              onClick={setAsDefault}
              style={[
                styles.skillAction,
                styles.defaultAction,
                isDefault && styles.defaultActionOn,
                defaultFailed && styles.defaultActionError,
              ]}
            >
              <IconButton.Icon
                render={
                  <HugeiconsIcon icon={Bookmark02Icon} fill={isDefault ? "currentColor" : "none"} />
                }
              />
            </IconButton.Root>
          }
        />
        <Tooltip>{defaultTooltip}</Tooltip>
      </Tooltip.Root>

      {defaultFailed ? (
        <VisuallyHidden role="alert">
          Couldn't set {skill.title} as the default narrator
        </VisuallyHidden>
      ) : null}
    </>
  );
}

function NarratorSkillItem({
  defaultSkillKey,
  skill,
  setDefault,
}: {
  defaultSkillKey: string | undefined;
  skill: Skill;
  setDefault: SetSkillDefaultMutation;
}) {
  const custom = skill.origin === SkillOrigin.Custom;

  return (
    <Item.Root
      render={<li {...stylex.props(stylex.defaultMarker())} />}
      inset="none"
      style={styles.skill}
    >
      <div {...stylex.props(styles.skillContent)}>
        <NarratorSkillDefaultAction
          defaultSkillKey={defaultSkillKey}
          skill={skill}
          setDefault={setDefault}
        />

        <div {...stylex.props(styles.skillIdentity)}>
          <Item.Label render={<h3 />} style={styles.skillTitle}>
            {skill.title}
          </Item.Label>
          {skill.origin === SkillOrigin.BuiltIn ? <Badge>Built-in</Badge> : null}
        </div>

        {custom ? (
          <div {...stylex.props(styles.skillActions)}>
            <NarratorSkillEditAction skill={skill} />
            <NarratorSkillDeleteAction
              isDefault={skill.key === defaultSkillKey}
              skill={skill}
              style={styles.skillAction}
            />
          </div>
        ) : null}

        <p {...stylex.props(styles.prompt)}>{skill.prompt}</p>
      </div>
    </Item.Root>
  );
}

function NarratorSection({ kind }: { kind: SkillKind }) {
  const pages = useSuspenseInfiniteQuery(skillPagesQuery(narratorSkillKindKey));
  const { data: defaultSelection } = useSuspenseQuery(skillDefaultQuery(narratorSkillKindKey));
  const setDefault = useSetSkillDefault(narratorSkillKindKey);
  const skills = pages.data.pages.flatMap((page) => page.skills);
  const headingId = `skill-kind-${kind.key}`;
  const descriptionId = `skill-kind-description-${kind.key}`;

  return (
    <Item.Section aria-labelledby={headingId} aria-describedby={descriptionId}>
      <Item.SectionHeader style={styles.sectionHeader}>
        <Item.SectionContent>
          <Item.Heading id={headingId}>{kind.name}</Item.Heading>
          <Item.SectionDescription id={descriptionId}>{kind.description}</Item.SectionDescription>
        </Item.SectionContent>
        <Button
          variant="ghost"
          render={<Link to="/library/narrator/new" replace />}
          style={styles.createAction}
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <Button.Label>Create</Button.Label>
        </Button>
      </Item.SectionHeader>

      <Item.Group render={<ul />} variant="separated">
        {skills.map((skill) => (
          <NarratorSkillItem
            key={skill.key}
            defaultSkillKey={defaultSelection.skillKey}
            skill={skill}
            setDefault={setDefault}
          />
        ))}
      </Item.Group>

      {pages.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
          style={styles.loadMore}
        >
          {pages.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </Item.Section>
  );
}

function NarratorRoute() {
  const kind = Route.useLoaderData();

  return (
    <>
      <ContentPane.Header>
        <ContentPane.HistoryBack />

        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Narrator</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          {kind ? (
            <NarratorSection kind={kind} />
          ) : (
            <div role="status" {...stylex.props(styles.unavailable)}>
              Narrator prompts aren't available right now.
            </div>
          )}
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  createAction: { alignSelf: "flex-start" },
  skill: { display: "block", minHeight: 0 },
  skillContent: {
    alignItems: "center",
    columnGap: "0.75rem",
    display: "grid",
    gridTemplateColumns: "2rem minmax(0, 1fr) auto",
    minWidth: 0,
    padding: "1rem",
    rowGap: "0.75rem",
  },
  skillIdentity: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    gridColumn: "2",
    gridRow: "1",
    minWidth: 0,
  },
  skillTitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  skillActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    gridColumn: "3",
    gridRow: "1",
    justifySelf: "end",
  },
  skillAction: {
    height: "2rem",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
    width: "2rem",
  },
  defaultAction: {
    gridColumn: "1",
    gridRow: "1",
  },
  defaultActionOn: {
    color: colors.foregroundAccent,
    opacity: { default: 1, ":disabled": 1 },
  },
  defaultActionError: {
    color: colors.foregroundDanger,
    opacity: 1,
  },
  prompt: {
    color: colors.foregroundSecondary,
    display: "-webkit-box",
    fontSize: tokens.fontSizeSmall,
    gridColumn: "2 / -1",
    gridRow: "2",
    lineHeight: tokens.lineHeightSmall,
    overflow: "hidden",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  loadMore: { marginBlockStart: "0.75rem" },
  unavailable: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
