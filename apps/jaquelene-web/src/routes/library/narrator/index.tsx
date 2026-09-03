import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin, type Prompt, type PromptKind } from "@jaquelene/ipc/renderer";
import { Badge, Button, Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  narratorPromptKind,
  promptDefaultQuery,
  promptKindsQuery,
  promptPagesQuery,
  useSetPromptDefault,
} from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/library/narrator/")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(promptKindsQuery);
    const kind = kinds.find(({ key }) => key === narratorPromptKind) ?? null;

    if (!kind) {
      return null;
    }

    await Promise.all([
      context.queryClient.query(promptDefaultQuery(narratorPromptKind)),
      context.queryClient.infiniteQuery(promptPagesQuery(narratorPromptKind)),
    ]);

    return kind;
  },
  component: NarratorRoute,
});

function PromptSummary({ prompt }: { prompt: Prompt }) {
  return (
    <>
      <span {...stylex.props(styles.promptHeading)}>
        <Item.Label render={<span />} style={styles.promptTitle}>
          {prompt.title}
        </Item.Label>
        {prompt.origin === PromptOrigin.Factory ? <Badge>Built-in</Badge> : null}
      </span>
      <span {...stylex.props(styles.promptBody)}>{prompt.body}</span>
    </>
  );
}

function PromptItem({
  defaultPromptKey,
  prompt,
  setDefault,
}: {
  defaultPromptKey: string | undefined;
  prompt: Prompt;
  setDefault: ReturnType<typeof useSetPromptDefault>;
}) {
  const isDefault = prompt.key === defaultPromptKey;
  const custom = prompt.origin === PromptOrigin.Custom;
  const content = custom ? (
    <Link
      to="/library/narrator/$promptKey/edit"
      params={{ promptKey: prompt.key }}
      replace
      aria-label={`Edit ${prompt.title}`}
      {...stylex.props(styles.promptEditSurface)}
    >
      <PromptSummary prompt={prompt} />
    </Link>
  ) : (
    <div {...stylex.props(styles.promptContent)}>
      <PromptSummary prompt={prompt} />
    </div>
  );

  return (
    <Item.Root inset="none" style={styles.prompt}>
      {content}
      <div {...stylex.props(styles.promptFooter)}>
        <div {...stylex.props(styles.defaultAction)}>
          {isDefault ? (
            <Badge>Default</Badge>
          ) : (
            <Button
              type="button"
              size="small"
              variant="ghost"
              disabled={setDefault.isPending}
              onClick={() => {
                setDefault.reset();
                setDefault.mutate(prompt.key, {
                  onError(cause) {
                    reportError("prompt.default.update", cause);
                  },
                });
              }}
            >
              Set as default
            </Button>
          )}
          {setDefault.isError && setDefault.variables === prompt.key ? (
            <span role="alert" {...stylex.props(styles.defaultError)}>
              Couldn’t set default.
            </span>
          ) : null}
        </div>
      </div>
    </Item.Root>
  );
}

function PromptKindSection({ kind }: { kind: PromptKind }) {
  const pages = useSuspenseInfiniteQuery(promptPagesQuery(kind.key));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(kind.key));
  const setDefault = useSetPromptDefault(kind.key);
  const prompts = pages.data.pages.flatMap((page) => page.prompts);
  const headingId = `prompt-kind-${kind.key}`;
  const descriptionId = `prompt-kind-description-${kind.key}`;

  return (
    <Item.Section aria-labelledby={headingId} aria-describedby={descriptionId}>
      <Item.SectionHeader style={styles.sectionHeader}>
        <Item.SectionContent>
          <Item.Heading id={headingId}>{kind.name}</Item.Heading>
          <Item.SectionDescription id={descriptionId}>{kind.description}</Item.SectionDescription>
        </Item.SectionContent>
        <Button variant="ghost" render={<Link to="/library/narrator/new" replace />}>
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          <Button.Label>Create</Button.Label>
        </Button>
      </Item.SectionHeader>

      <Item.Group variant="separated">
        {prompts.map((prompt) => (
          <PromptItem
            key={prompt.key}
            defaultPromptKey={defaultSelection.promptKey}
            prompt={prompt}
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
            <PromptKindSection kind={kind} />
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
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  prompt: { display: "block", minHeight: 0 },
  promptContent: { minWidth: 0, padding: "1rem" },
  promptEditSurface: {
    backgroundColor: {
      default: "transparent",
      ":hover": colors.backgroundInteractive,
      ":focus-visible": colors.backgroundInteractive,
    },
    color: colors.foregroundPrimary,
    display: "block",
    minWidth: 0,
    outlineColor: { default: null, ":focus-visible": colors.focusRing },
    outlineOffset: { default: null, ":focus-visible": -2 },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 1 },
    padding: "1rem",
    textAlign: "start",
    width: "100%",
  },
  promptHeading: { alignItems: "center", display: "flex", gap: "0.75rem", minWidth: 0 },
  promptTitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  promptFooter: {
    alignItems: "center",
    borderBlockStartColor: colors.borderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    display: "flex",
    padding: "0.5rem 0.75rem",
  },
  defaultAction: { alignItems: "center", display: "flex", gap: "0.5rem", minWidth: 0 },
  defaultError: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  promptBody: {
    color: colors.foregroundPrimary,
    display: "-webkit-box",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginBlock: "1rem 0",
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
