import type { TextLibrary } from "./text-libraries";
import { Link, useNavigate } from "@tanstack/react-router";
import { PromptEditor } from "@/feature/prompt/editor";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export function NewTextLibraryPrompt({ library }: { library: TextLibrary }) {
  const navigate = useNavigate();
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
              <Breadcrumb.Page id="new-library-entry-page">New</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>
      <ContentPane.Viewport>
        <ContentPane.Body>
          <PromptEditor
            aria-labelledby="new-library-entry-page"
            kind={library.kind}
            content={{
              label: library.label,
              noun: library.noun,
              description: library.contentDescription,
            }}
            onCancel={() => navigate({ to: library.indexPath, replace: true })}
            onSaved={(prompt) =>
              navigate({
                to: library.editPath,
                params: { promptKey: prompt.key },
                replace: true,
              })
            }
          />
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}
