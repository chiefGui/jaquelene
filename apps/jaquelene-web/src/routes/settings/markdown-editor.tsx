import { Button } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useDeferredValue, useId, useState } from "react";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const MarkdownPreview = lazy(async () => {
  const { Markdown } = await import("@/feature/markdown/markdown");
  return { default: Markdown };
});

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
  const [previewVisible, setPreviewVisible] = useState(false);
  const editorHeadingId = useId();
  const editorDescriptionId = useId();
  const previewHeadingId = useId();
  const deferredMarkdown = useDeferredValue(markdown);

  return (
    <>
      <ContentPane.Header>
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
              <div>
                <h1 id={editorHeadingId} {...stylex.props(styles.heading)}>
                  Markdown editor
                </h1>
                <p id={editorDescriptionId} {...stylex.props(styles.description)}>
                  This draft is local and resets when the page reloads.
                </p>
              </div>

              <Button
                type="button"
                size="small"
                variant={previewVisible ? "soft" : "ghost"}
                aria-pressed={previewVisible}
                onClick={() => setPreviewVisible((visible) => !visible)}
              >
                Preview
              </Button>
            </div>

            <MarkdownEditor
              aria-labelledby={editorHeadingId}
              aria-describedby={editorDescriptionId}
              value={markdown}
              onChange={setMarkdown}
            />
          </section>

          {previewVisible ? (
            <section aria-labelledby={previewHeadingId} {...stylex.props(styles.preview)}>
              <h2 id={previewHeadingId} {...stylex.props(styles.previewHeading)}>
                Preview
              </h2>
              <div {...stylex.props(styles.previewContent)}>
                <Suspense
                  fallback={<div {...stylex.props(styles.previewLoading)}>Loading preview…</div>}
                >
                  <MarkdownPreview content={deferredMarkdown} />
                </Suspense>
              </div>
            </section>
          ) : null}
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  introduction: {
    alignItems: "flex-start",
    display: "flex",
    gap: "2rem",
    justifyContent: "space-between",
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
  preview: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: colors.borderDefault,
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    marginTop: "1rem",
    overflow: "hidden",
  },
  previewHeading: {
    borderBottomColor: colors.borderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightXSmall,
    padding: "0.5rem 0.75rem",
  },
  previewContent: {
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    minHeight: "3.25rem",
    padding: "1rem",
  },
  previewLoading: {
    color: colors.foregroundSecondary,
  },
});
