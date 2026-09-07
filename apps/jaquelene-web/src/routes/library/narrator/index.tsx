import {
  PromptLibraryCreateItem,
  PromptLibraryPagination,
  promptLibraryStyles,
} from "@/feature/prompt/library-layout";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin, narratorPromptKindKey } from "@jaquelene/domain";
import type { CustomPrompt, Prompt, PromptKind } from "@jaquelene/ipc/renderer";
import { Badge, IconButton, Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { NarratorPromptDeleteAction } from "@/feature/narrator/delete-action";
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
import {
  PromptDefaultAction,
  type SetPromptDefaultMutation,
} from "@/feature/prompt/default-action";

export const Route = createFileRoute("/library/narrator/")({
  loader: async ({ context }) => {
    const kinds = await context.queryClient.query(promptKindsQuery);
    const kind = kinds.find(({ key }) => key === narratorPromptKindKey) ?? null;

    if (!kind) {
      return null;
    }

    await Promise.all([
      context.queryClient.query(promptDefaultQuery(narratorPromptKindKey)),
      context.queryClient.infiniteQuery(promptPagesQuery(narratorPromptKindKey)),
    ]);

    return kind;
  },
  component: NarratorRoute,
});

function NarratorPromptEditAction({ prompt }: { prompt: CustomPrompt }) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        render={
          <IconButton.Root
            render={
              <Link
                to="/library/narrator/$promptKey/edit"
                params={{ promptKey: prompt.key }}
                replace
              />
            }
            aria-label={`Edit ${prompt.title}`}
            style={promptLibraryItemStyles.action}
          >
            <IconButton.Icon render={<HugeiconsIcon icon={EditIcon} />} />
          </IconButton.Root>
        }
      />
      <Tooltip>Edit</Tooltip>
    </Tooltip.Root>
  );
}

function NarratorPromptItem({
  defaultPromptKey,
  prompt,
  setDefault,
}: {
  defaultPromptKey: string | undefined;
  prompt: Prompt;
  setDefault: SetPromptDefaultMutation;
}) {
  const custom = prompt.origin === PromptOrigin.Custom;

  return (
    <PromptLibraryItem
      prompt={prompt}
      leadingAction={
        <PromptDefaultAction
          kindLabel="narrator"
          defaultPromptKey={defaultPromptKey}
          prompt={prompt}
          setDefault={setDefault}
        />
      }
      badge={prompt.origin === PromptOrigin.BuiltIn && <Badge>Built-in</Badge>}
      actions={
        custom && (
          <>
            <NarratorPromptEditAction prompt={prompt} />
            <NarratorPromptDeleteAction
              isDefault={prompt.key === defaultPromptKey}
              prompt={prompt}
              style={promptLibraryItemStyles.action}
            />
          </>
        )
      }
    />
  );
}

function NarratorSection({ kind }: { kind: PromptKind }) {
  const pages = useSuspenseInfiniteQuery(promptPagesQuery(narratorPromptKindKey));
  const { data: defaultSelection } = useSuspenseQuery(promptDefaultQuery(narratorPromptKindKey));
  const setDefault = useSetPromptDefault(narratorPromptKindKey);
  const prompts = pages.data.pages.flatMap((page) => page.prompts);
  const headingId = `prompt-kind-${kind.key}`;
  const descriptionId = `prompt-kind-description-${kind.key}`;

  function renderPrompt(prompt: Prompt) {
    return (
      <NarratorPromptItem
        key={prompt.key}
        defaultPromptKey={defaultSelection.promptKey}
        prompt={prompt}
        setDefault={setDefault}
      />
    );
  }

  return (
    <Item.Section aria-labelledby={headingId} aria-describedby={descriptionId}>
      <Item.SectionHeader>
        <Item.SectionContent>
          <Item.Heading id={headingId}>{kind.name}</Item.Heading>
          <Item.SectionDescription
            id={descriptionId}
            style={promptLibraryStyles.sectionDescription}
          >
            {kind.description}
          </Item.SectionDescription>
        </Item.SectionContent>
      </Item.SectionHeader>

      <Item.Group render={<ul />} variant="separated">
        {prompts.filter((prompt) => prompt.origin === PromptOrigin.BuiltIn).map(renderPrompt)}
        <PromptLibraryCreateItem render={<Link to="/library/narrator/new" replace />}>
          Create narrator
        </PromptLibraryCreateItem>
        {prompts.filter((prompt) => prompt.origin === PromptOrigin.Custom).map(renderPrompt)}
      </Item.Group>

      <PromptLibraryPagination query={pages} label="narrators" />
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
  unavailable: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
