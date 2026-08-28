import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function ContentPaneRoot({
  "aria-label": ariaLabel = "Content pane",
  style,
  ...props
}: StyleableProps<ComponentProps<"main">>) {
  return <main {...props} aria-label={ariaLabel} {...stylex.props(styles.root, style)} />;
}

function ContentPaneHeader({ style, ...props }: StyleableProps<ComponentProps<"header">>) {
  return <header {...props} {...stylex.props(styles.header, style)} />;
}

function ContentPaneViewport({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.viewport, style)} />;
}

function ContentPaneBody({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.body, style)} />;
}

export const ContentPane = {
  Root: ContentPaneRoot,
  Header: ContentPaneHeader,
  Viewport: ContentPaneViewport,
  Body: ContentPaneBody,
} as const;

const styles = stylex.create({
  root: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    marginRight: "0.5rem",
    marginTop: "0.5rem",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexShrink: 0,
    height: "3.5rem",
    paddingInline: "1.25rem",
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  body: {
    marginInline: "auto",
    maxWidth: "42rem",
    padding: "1.5rem",
    width: "100%",
  },
});
