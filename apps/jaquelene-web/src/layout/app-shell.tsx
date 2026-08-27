import { Outlet, useMatches } from "@tanstack/react-router";
import { ContentPane } from "./content-pane";
import { StatusBar } from "./status-bar";

export function AppShell() {
  const Sidebar = useMatches({
    select: (matches) =>
      matches.findLast(({ staticData }) => staticData.primarySidebar)?.staticData.primarySidebar,
  });

  if (!Sidebar) {
    throw new Error("The matched route tree does not define a primary sidebar.");
  }

  return (
    <div className="grid h-dvh min-h-0 grid-cols-[15rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_2.25rem] overflow-hidden bg-canvas text-foreground">
      <Sidebar />
      <ContentPane.Root>
        <Outlet />
      </ContentPane.Root>
      <StatusBar />
    </div>
  );
}
