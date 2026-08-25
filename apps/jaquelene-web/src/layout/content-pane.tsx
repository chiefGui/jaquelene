import { cn } from "@jaquelene/ui";
import type { ComponentProps } from "react";

function ContentPaneRoot({
  className,
  "aria-label": ariaLabel = "Content pane",
  ...props
}: ComponentProps<"main">) {
  return (
    <main
      {...props}
      aria-label={ariaLabel}
      className={cn(
        "mt-2 mr-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface",
        className,
      )}
    />
  );
}

function ContentPaneHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn("flex h-14 shrink-0 items-center border-b border-border px-5", className)}
    />
  );
}

function ContentPaneViewport({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("min-h-0 flex-1 overflow-auto", className)} />;
}

export const ContentPane = {
  Root: ContentPaneRoot,
  Header: ContentPaneHeader,
  Viewport: ContentPaneViewport,
} as const;
