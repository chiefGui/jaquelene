import { MotionProvider } from "@jaquelene/ui/motion";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useMatches } from "@tanstack/react-router";
import { useApplyUiFont } from "@/feature/appearance/user-interface/font";
import { motionPreferences } from "@/feature/appearance/user-interface/motion";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { ContentPane } from "./content-pane";
import { StatusBar } from "./status-bar";

export function AppShell() {
  const { data: preferences } = useSuspenseQuery(userInterfacePreferencesQuery);
  const Sidebar = useMatches({
    select: (matches) =>
      matches.findLast(({ staticData }) => staticData.primarySidebar)?.staticData.primarySidebar,
  });
  useApplyUiFont(preferences.font);

  if (!Sidebar) {
    throw new Error("The matched route tree does not define a primary sidebar.");
  }

  return (
    <MotionProvider mode={motionPreferences[preferences.motion].mode}>
      <div className="grid h-dvh min-h-0 grid-cols-[14rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_2.25rem] overflow-hidden bg-canvas text-sm text-foreground">
        <Sidebar />
        <ContentPane.Root>
          <Outlet />
        </ContentPane.Root>
        <StatusBar />
      </div>
    </MotionProvider>
  );
}
