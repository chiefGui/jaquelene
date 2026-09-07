import { PromptLibraryCreateItem, promptLibraryStyles } from "./library-layout";
import type { TextLibrary } from "./text-libraries";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin } from "@jaquelene/domain";
import { Button, IconButton, Item } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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

export function TextLibraryList({ library }: { library: TextLibrary }) {
  const { data: kinds } = useSuspenseQuery(promptKindsQuery);
  const kind = kinds.find(({ key }) => key === library.kind);
  const pages = useSuspenseInfiniteQuery(promptPagesQuery(library.kind));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(library.kind));
  const setDefault = useSetPromptDefault(library.kind);
  if (!kind) throw new Error("The library is unavailable.");
  const entries = pages.data.pages.flatMap((page) => page.prompts);
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
              <Breadcrumb.Page>{library.plural}</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby={`${library.kind}-heading`}>
            <Item.SectionHeader>
              <Item.SectionContent>
                <Item.Heading id={`${library.kind}-heading`}>{kind.name}</Item.Heading>
                <Item.SectionDescription style={promptLibraryStyles.sectionDescription}>
                  {kind.description}
                </Item.SectionDescription>
              </Item.SectionContent>
            </Item.SectionHeader>
            <Item.Group render={<ul />} variant="separated">
              <PromptLibraryCreateItem render={<Link to={library.newPath} replace />}>
                Create {library.noun}
              </PromptLibraryCreateItem>
              {entries.map((prompt) => (
                <PromptLibraryItem
                  key={prompt.key}
                  prompt={prompt}
                  leadingAction={
                    <PromptDefaultAction
                      prompt={prompt}
                      kindLabel={library.noun}
                      defaultPromptKey={defaultSelection.promptKey}
                      setDefault={setDefault}
                      allowClear
                    />
                  }
                  actions={
                    prompt.origin === PromptOrigin.Custom && (
                      <>
                        <Tooltip.Root>
                          <Tooltip.Anchor
                            render={
                              <IconButton.Root
                                aria-label={`Edit ${prompt.title}`}
                                style={promptLibraryItemStyles.action}
                                render={
                                  <Link
                                    to={library.editPath}
                                    params={{ promptKey: prompt.key }}
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
                          prompt={prompt}
                          style={promptLibraryItemStyles.action}
                          description={`Campaigns that copied this ${library.noun} keep their text. This can't be undone.`}
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
                Couldn't load more {library.pluralNoun}. Try again.
              </p>
            )}
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  loadMore: { marginBlockStart: "0.75rem" },
  error: { color: colors.foregroundDanger, fontSize: tokens.fontSizeSmall },
});
