import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Bookmark02Icon from "@hugeicons/core-free-icons/Bookmark02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { PromptOrigin, narratorPromptKindKey } from "@jaquelene/domain";
import type { CustomPrompt, Prompt, PromptKind } from "@jaquelene/ipc/renderer";
import { Badge, Button, IconButton, Item } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { reportError } from "@/feature/diagnostics/diagnostics";
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

type SetPromptDefaultMutation = ReturnType<typeof useSetPromptDefault>;

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

function NarratorPromptDefaultAction({
  defaultPromptKey,
  prompt,
  setDefault,
}: {
  defaultPromptKey: string | undefined;
  prompt: Prompt;
  setDefault: SetPromptDefaultMutation;
}) {
  const displayedDefaultPromptKey = setDefault.isPending ? setDefault.variables : defaultPromptKey;
  const isDefault = prompt.key === displayedDefaultPromptKey;
  const defaultPending = setDefault.isPending && setDefault.variables === prompt.key;
  const defaultFailed = setDefault.isError && setDefault.variables === prompt.key;
  const defaultTooltip = defaultFailed
    ? "Couldn't set default"
    : isDefault
      ? "Default"
      : "Set as default";

  function setAsDefault() {
    setDefault.reset();
    setDefault.mutate(prompt.key, {
      onError(cause) {
        reportError("prompt.default.update", cause);
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
                  ? `${prompt.title} is the default narrator`
                  : `Set ${prompt.title} as the default narrator`
              }
              aria-pressed={isDefault}
              disabled={isDefault || defaultPending}
              onClick={setAsDefault}
              style={[
                promptLibraryItemStyles.action,
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
          Couldn't set {prompt.title} as the default narrator
        </VisuallyHidden>
      ) : null}
    </>
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
        <NarratorPromptDefaultAction
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
        {prompts.map((prompt) => (
          <NarratorPromptItem
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
  defaultActionOn: {
    color: colors.foregroundAccent,
    opacity: { default: 1, ":disabled": 1 },
  },
  defaultActionError: {
    color: colors.foregroundDanger,
    opacity: 1,
  },
  loadMore: { marginBlockStart: "0.75rem" },
  unavailable: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
