import type { TextLibrary } from "./text-libraries";
import { PromptOrigin } from "@jaquelene/domain";
import { Button, Item } from "@jaquelene/ui";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PromptDeleteAction } from "@/feature/prompt/delete-action";
import { PromptEditor } from "@/feature/prompt/editor";
import { PromptMetadata } from "@/feature/prompt/metadata";
import { PromptDefaultControl } from "@/feature/prompt/default-control";
import { promptQuery } from "@/feature/prompt/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { EmptyState } from "@/primitive/empty-state";

export function EditTextLibraryPrompt({
  library,
  promptKey: key,
}: {
  library: TextLibrary;
  promptKey: string | null;
}) {
  const { data: prompt } = useQuery({ ...promptQuery(key ?? ""), enabled: key !== null });
  const navigate = useNavigate();
  let content = (
    <EmptyState.Root>
      <EmptyState.Title>{library.label} not found</EmptyState.Title>
      <EmptyState.Description>It may have been deleted.</EmptyState.Description>
      <Button variant="ghost" render={<Link to={library.indexPath} replace />}>
        Back to {library.pluralNoun}
      </Button>
    </EmptyState.Root>
  );
  if (prompt?.kind === library.kind && prompt.origin === PromptOrigin.Custom) {
    content = (
      <div {...stylex.props(styles.editor)}>
        <PromptEditor aria-labelledby="edit-library-entry-page" prompt={prompt} content={library} />
        <Item.Group aria-label={`${library.label} management`}>
          <PromptDefaultControl
            prompt={prompt}
            kindLabel={library.noun}
            description={`The ${library.noun} copied into new campaigns. Turn off to start with an empty ${library.noun}.`}
          />
          <Item.Root>
            <Item.Content>
              <Item.Label>Delete</Item.Label>
              <Item.Description>Permanently remove this {library.noun}.</Item.Description>
            </Item.Content>
            <PromptDeleteAction
              prompt={prompt}
              description={`Campaigns that copied this ${library.noun} keep their text. This can't be undone.`}
              onDeleted={() => navigate({ to: library.indexPath, replace: true })}
            />
          </Item.Root>
        </Item.Group>
        <PromptMetadata prompt={prompt} />
      </div>
    );
  }
  return (
    <>
      <ContentPane.Header>
        <ContentPane.Back
          render={<Link to={library.indexPath} replace />}
          aria-label={`Back to ${library.pluralNoun}`}
        />
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Library</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Link to={library.indexPath}>{library.plural}</Breadcrumb.Link>
            </Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page id="edit-library-entry-page">
                {prompt?.title ?? library.label}
              </Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>{content}</ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  editor: { display: "flex", flexDirection: "column", gap: "1.5rem" },
});
