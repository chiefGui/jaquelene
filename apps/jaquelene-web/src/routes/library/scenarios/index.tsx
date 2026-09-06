import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin, scenarioPromptKindKey } from "@jaquelene/domain";
import { Button, IconButton, Item } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { PromptDeleteAction } from "@/feature/prompt/delete-action";
import { PromptDefaultAction } from "@/feature/prompt/default-action";
import {
  promptDefaultQuery,
  promptKindsQuery,
  promptPagesQuery,
  useSetPromptDefault,
} from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EditIcon } from "@/primitive/icons";
import { PromptLibraryItem, promptLibraryItemStyles } from "@/feature/prompt/library-item";

export const Route = createFileRoute("/library/scenarios/")({
  loader: async ({ context }) => {
    const [kinds] = await Promise.all([
      context.queryClient.query(promptKindsQuery),
      context.queryClient.query(promptDefaultQuery(scenarioPromptKindKey)),
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
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(scenarioPromptKindKey));
  const setDefault = useSetPromptDefault(scenarioPromptKindKey);
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
            <Item.Group render={<ul />} variant="separated">
              {scenarios.length === 0 && (
                <Item.Root render={<li />} inset="none">
                  <Button
                    variant="ghost"
                    style={styles.createFirst}
                    render={<Link to="/library/scenarios/new" replace />}
                  >
                    Create your first scenario
                  </Button>
                </Item.Root>
              )}
              {scenarios.map((scenario) => (
                <PromptLibraryItem
                  key={scenario.key}
                  prompt={scenario}
                  leadingAction={
                    <PromptDefaultAction
                      prompt={scenario}
                      kindLabel="scenario"
                      defaultPromptKey={defaultSelection.promptKey}
                      setDefault={setDefault}
                      allowClear
                    />
                  }
                  actions={
                    scenario.origin === PromptOrigin.Custom && (
                      <>
                        <Tooltip.Root>
                          <Tooltip.Anchor
                            render={
                              <IconButton.Root
                                aria-label={`Edit ${scenario.title}`}
                                style={promptLibraryItemStyles.action}
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
                          style={promptLibraryItemStyles.action}
                          description="Campaigns that copied this scenario keep their text. This can't be undone."
                        />
                      </>
                    )
                  }
                />
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
  createFirst: { minHeight: "5rem", outlineOffset: -3, width: "100%" },
  loadMore: { marginBlockStart: "0.75rem" },
  error: { color: colors.foregroundDanger, fontSize: tokens.fontSizeSmall },
});
