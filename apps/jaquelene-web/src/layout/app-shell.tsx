import { MotionProvider } from "@jaquelene/ui/motion";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
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
      <div {...stylex.props(styles.root)}>
        <Sidebar />
        <ContentPane.Root>
          <Outlet />
        </ContentPane.Root>
        <StatusBar />
      </div>
    </MotionProvider>
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    display: "grid",
    fontSize: tokens.fontSizeSmall,
    gridTemplateColumns: "14rem minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr) 2.25rem",
    height: "100dvh",
    lineHeight: tokens.lineHeightSmall,
    minHeight: 0,
    overflow: "hidden",
  },
});
