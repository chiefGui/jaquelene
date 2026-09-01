import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { paneSurface } from "./pane-surface.stylex";
import { shellChrome } from "./shell-chrome.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function ContentPaneRoot({
  "aria-label": ariaLabel = "Content pane",
  style,
  ...props
}: StyleableProps<ComponentProps<"main">>) {
  return (
    <main
      {...props}
      aria-label={ariaLabel}
      {...stylex.props(paneSurface.root, styles.root, style)}
    />
  );
}

function ContentPaneHeader({ style, ...props }: StyleableProps<ComponentProps<"header">>) {
  return <header {...props} {...stylex.props(shellChrome.header, styles.header, style)} />;
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
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingInlineStart: "0.75rem",
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
