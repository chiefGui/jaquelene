import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin, scenarioPromptKindKey } from "@jaquelene/domain";
import { Button, IconButton, Item } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PromptDeleteAction } from "@/feature/prompt/delete-action";
import { promptKindsQuery, promptPagesQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";
import { EditIcon } from "@/primitive/icons";

export const Route = createFileRoute("/library/scenarios/")({
  loader: async ({ context }) => {
    const [kinds] = await Promise.all([
      context.queryClient.query(promptKindsQuery),
      context.queryClient.infiniteQuery(promptPagesQuery(scenarioPromptKindKey)),
    ]);
    const kind = kinds.find(({ key }) => key === scenarioPromptKindKey);
    if (!kind) {
      throw new Error("The scenario library is unavailable.");
    }
    return { name: kind.name, description: kind.description };
  },
  component: ScenariosRoute,
});

function ScenariosRoute() {
  const kind = Route.useLoaderData();
  const pages = useSuspenseInfiniteQuery(promptPagesQuery(scenarioPromptKindKey));
  const scenarios = pages.data.pages.flatMap((page) => page.prompts);
  let loadMoreLabel = "Load more";
  if (pages.isFetchingNextPage) {
    loadMoreLabel = "Loading…";
  }

  return (
    <>
      <ContentPane.Header>
        <ContentPane.HistoryBack />
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Scenarios</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="scenarios-heading">
            <Item.SectionHeader style={styles.header}>
              <Item.SectionContent>
                <Item.Heading id="scenarios-heading">{kind.name}</Item.Heading>
                <Item.SectionDescription>{kind.description}</Item.SectionDescription>
              </Item.SectionContent>
              <Button variant="ghost" render={<Link to="/library/scenarios/new" replace />}>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
                <Button.Label>Create</Button.Label>
              </Button>
            </Item.SectionHeader>
            {scenarios.length === 0 && (
              <EmptyState.Root>
                <EmptyState.Title>No scenarios yet</EmptyState.Title>
                <EmptyState.Description>
                  Create a setting to reuse across campaigns.
                </EmptyState.Description>
              </EmptyState.Root>
            )}
            <Item.Group render={<ul />} variant="separated">
              {scenarios.map((scenario) => (
                <Item.Root
                  key={scenario.key}
                  render={<li {...stylex.props(stylex.defaultMarker())} />}
                >
                  <Item.Content>
                    <Item.Label render={<h3 />} style={styles.title}>
                      {scenario.title}
                    </Item.Label>
                    <p {...stylex.props(styles.body)}>{scenario.body}</p>
                  </Item.Content>
                  {scenario.origin === PromptOrigin.Custom && (
                    <Item.Value style={styles.actions}>
                      <Tooltip.Root>
                        <Tooltip.Anchor
                          render={
                            <IconButton.Root
                              aria-label={`Edit ${scenario.title}`}
                              style={styles.action}
                              render={
                                <Link
                                  to="/library/scenarios/$promptKey/edit"
                                  params={{ promptKey: scenario.key }}
                                  replace
                                />
                              }
                            >
                              <IconButton.Icon render={<HugeiconsIcon icon={EditIcon} />} />
                            </IconButton.Root>
                          }
                        />
                        <Tooltip>Edit</Tooltip>
                      </Tooltip.Root>
                      <PromptDeleteAction
                        prompt={scenario}
                        style={styles.action}
                        description="Campaigns that copied this scenario keep their text. This can't be undone."
                      />
                    </Item.Value>
                  )}
                </Item.Root>
              ))}
            </Item.Group>
            {pages.hasNextPage && (
              <Button
                type="button"
                variant="ghost"
                disabled={pages.isFetchingNextPage}
                onClick={() => void pages.fetchNextPage()}
                style={styles.loadMore}
              >
                {loadMoreLabel}
              </Button>
            )}
            {pages.isFetchNextPageError && (
              <p role="alert" {...stylex.props(styles.error)}>
                Couldn't load more scenarios. Try again.
              </p>
            )}
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", gap: "0.25rem" },
  action: {
    height: "2rem",
    width: "2rem",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  body: {
    color: colors.foregroundSecondary,
    display: "-webkit-box",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    margin: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  loadMore: { marginBlockStart: "0.75rem" },
  error: { color: colors.foregroundDanger, fontSize: tokens.fontSizeSmall },
});
