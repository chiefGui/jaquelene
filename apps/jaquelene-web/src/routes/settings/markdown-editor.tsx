import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const initialMarkdown = `# Narrative direction

Write an interactive story with **specific, sensory detail** and clear spatial continuity.

## Priorities

- Preserve established facts and character motivations.
- Give every speaker a distinct voice.
- Let quiet moments breathe.

> Never decide what the player thinks, says, or does.

Use \`scene context\` as guidance, not text to repeat.`;

export const Route = createFileRoute("/settings/markdown-editor")({
  component: MarkdownEditorRoute,
});

function MarkdownEditorRoute() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const editorHeadingId = useId();
  const editorDescriptionId = useId();

  return (
    <>
      <ContentPane.Header>
        <ContentPane.HistoryBack />

        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Markdown editor lab</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <section aria-labelledby={editorHeadingId} aria-describedby={editorDescriptionId}>
            <div {...stylex.props(styles.introduction)}>
              <h1 id={editorHeadingId} {...stylex.props(styles.heading)}>
                Markdown editor
              </h1>
              <p id={editorDescriptionId} {...stylex.props(styles.description)}>
                This draft is local and resets when the page reloads.
              </p>
            </div>

            <MarkdownEditor
              aria-labelledby={editorHeadingId}
              aria-describedby={editorDescriptionId}
              value={markdown}
              onValueChange={setMarkdown}
            />
          </section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  introduction: {
    marginBottom: "0.75rem",
  },
  heading: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.25rem",
  },
});
