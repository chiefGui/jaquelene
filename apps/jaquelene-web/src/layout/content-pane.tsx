import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton, type IconButtonProps } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useRouter } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { navigateBack, type NavigationDestination } from "@/application/navigation";
import {
  ContentPaneAside,
  ContentPaneAsideBody,
  ContentPaneAsideFooter,
  ContentPaneAsideProvider,
  ContentPaneAsideToggle,
  ContentPaneAsideViewport,
  ContentPaneSplit,
} from "./content-pane-aside";
import { contentPaneLayout, shellLayout } from "./layout-tokens.stylex";
import { paneSurface } from "./pane-surface.stylex";
import { shellChrome } from "./shell-chrome.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

export type ContentPaneBackProps = Omit<IconButtonProps, "aria-label" | "children" | "size"> & {
  "aria-label"?: string;
};

type ContentPaneHistoryBackProps = Omit<ContentPaneBackProps, "onClick" | "render" | "type"> & {
  fallback?: NavigationDestination;
};

function ContentPaneRoot({
  "aria-label": ariaLabel = "Content pane",
  style,
  ...props
}: StyleableProps<ComponentProps<"main">>) {
  return (
    <ContentPaneAsideProvider>
      <main
        {...props}
        aria-label={ariaLabel}
        {...stylex.props(paneSurface.root, styles.root, style)}
      />
    </ContentPaneAsideProvider>
  );
}

function ContentPaneHeader({
  layout = "inline",
  style,
  ...props
}: StyleableProps<ComponentProps<"header">> & {
  layout?: "inline" | "centered";
}) {
  return (
    <header
      {...props}
      {...stylex.props(
        shellChrome.header,
        styles.header,
        layout === "centered" && styles.centeredHeader,
        style,
      )}
    />
  );
}

function ContentPaneHeaderLeading({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.headerLeading, style)} />;
}

function ContentPaneHeaderTitle({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.headerTitle, style)} />;
}

function ContentPaneHeaderTrailing({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.headerTrailing, style)} />;
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
    <IconButton.Root {...props} aria-label={ariaLabel} size="small" style={[styles.back, style]}>
      <IconButton.Icon render={<HugeiconsIcon icon={ArrowLeft01Icon} />} />
    </IconButton.Root>
  );
}

function ContentPaneHistoryBack({ fallback, ...props }: ContentPaneHistoryBackProps) {
  const router = useRouter();

  return (
    <ContentPaneBack type="button" onClick={() => navigateBack(router, fallback)} {...props} />
  );
}

export const ContentPane = {
  Root: ContentPaneRoot,
  Header: ContentPaneHeader,
  HeaderLeading: ContentPaneHeaderLeading,
  HeaderTitle: ContentPaneHeaderTitle,
  HeaderTrailing: ContentPaneHeaderTrailing,
  Viewport: ContentPaneViewport,
  Body: ContentPaneBody,
  Back: ContentPaneBack,
  HistoryBack: ContentPaneHistoryBack,
  AsideToggle: ContentPaneAsideToggle,
  Split: ContentPaneSplit,
  Aside: ContentPaneAside,
  AsideViewport: ContentPaneAsideViewport,
  AsideBody: ContentPaneAsideBody,
  AsideFooter: ContentPaneAsideFooter,
} as const;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
  },
  header: {
    backgroundColor: colors.backgroundSurface,
    gridColumn: "1 / -1",
    gridRow: 1,
    paddingInlineStart: "0.75rem",
    position: "relative",
    "::before": {
      backgroundColor: "inherit",
      content: '""',
      height: "2.5rem",
      insetBlockStart: "100%",
      insetInlineStart: 0,
      insetInlineEnd: contentPaneLayout.headerInsetEnd,
      // The mask controls opacity; the painted color stays identical to the header.
      maskImage:
        "linear-gradient(to bottom, black, color-mix(in oklch, black 90%, transparent) 20%, color-mix(in oklch, black 65%, transparent) 40%, color-mix(in oklch, black 35%, transparent) 60%, color-mix(in oklch, black 10%, transparent) 80%, transparent)",
      maskMode: "alpha",
      pointerEvents: "none",
      position: "absolute",
      zIndex: 1,
    },
  },
  centeredHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
  },
  headerLeading: {
    gridColumn: 1,
    gridRow: 1,
    justifySelf: "start",
    marginInlineStart: "0.75rem",
    zIndex: 1,
  },
  headerTitle: {
    display: "flex",
    gridColumn: 1,
    gridRow: 1,
    justifyContent: "center",
    justifySelf: "start",
    marginInlineStart: shellLayout.headerHeight,
    minWidth: 0,
    width: `max(0px, calc(100% - ${contentPaneLayout.headerInsetEnd} - ${shellLayout.headerHeight} - ${shellLayout.headerHeight}))`,
    zIndex: 1,
  },
  headerTrailing: {
    gridColumn: 1,
    gridRow: 1,
    justifySelf: "end",
    marginInlineEnd: `calc((${shellLayout.headerHeight} - ${tokens.controlHeight}) / 2)`,
  },
  back: {
    marginInlineEnd: "0.5rem",
    marginInlineStart: "-0.125rem",
  },
  viewport: {
    flex: 1,
    gridColumn: 1,
    gridRow: 2,
    isolation: "isolate",
    minHeight: 0,
    minWidth: 0,
    overflow: "auto",
  },
  body: {
    marginInline: "auto",
    maxWidth: "42rem",
    padding: "1.5rem",
    width: "100%",
  },
});
