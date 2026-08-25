import { Outlet } from "@tanstack/react-router";

export function ContentPane() {
  return (
    <main
      aria-label="Content pane"
      className="-ml-px mt-2 mr-2 min-h-0 min-w-0 overflow-hidden rounded-xl border border-border bg-surface"
    >
      <Outlet />
    </main>
  );
}
