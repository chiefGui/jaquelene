import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton, type IconButtonProps } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { paneSurface } from "./pane-surface.stylex";
import { shellChrome } from "./shell-chrome.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

export type ContentPaneBackProps = Omit<IconButtonProps, "aria-label" | "children"> & {
  "aria-label"?: string;
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

function ContentPaneBack({
  "aria-label": ariaLabel = "Back",
  style,
  ...props
}: ContentPaneBackProps) {
  return (
    <IconButton {...props} aria-label={ariaLabel} style={[styles.back, style]}>
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        size={16}
        color="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </IconButton>
  );
}

export const ContentPane = {
  Root: ContentPaneRoot,
  Header: ContentPaneHeader,
  Viewport: ContentPaneViewport,
  Body: ContentPaneBody,
  Back: ContentPaneBack,
} as const;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottomColor: colors.borderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingInlineStart: "0.75rem",
  },
  back: {
    marginInlineEnd: "0.25rem",
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
