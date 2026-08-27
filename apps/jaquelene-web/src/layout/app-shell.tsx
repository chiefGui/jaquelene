import { Outlet, useMatches } from "@tanstack/react-router";
import { ContentPane } from "./content-pane";
import { PrimarySidebar } from "./primary-sidebar";
import { StatusBar } from "./status-bar";

export function AppShell() {
  const navigation = useMatches({
    select: (matches) =>
      matches.findLast(({ staticData }) => staticData.primarySidebar)?.staticData.primarySidebar,
  });

  if (!navigation) {
    throw new Error("The matched route tree does not define primary sidebar navigation.");
  }

  return (
    <div className="grid h-dvh min-h-0 grid-cols-[15rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_2.25rem] overflow-hidden bg-canvas text-foreground">
      <PrimarySidebar navigation={navigation} />
      <ContentPane.Root>
        <Outlet />
      </ContentPane.Root>
      <StatusBar />
    </div>
  );
}
