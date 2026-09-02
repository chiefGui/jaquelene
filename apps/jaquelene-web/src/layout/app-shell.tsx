import { MotionProvider } from "@jaquelene/ui/motion";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useMatches } from "@tanstack/react-router";
import { useApplyUiFont } from "@/feature/appearance/user-interface/font";
import { motionPreferences } from "@/feature/appearance/user-interface/motion";
import { userInterfacePreferencesQuery } from "@/feature/appearance/user-interface/query";
import { useApplyUiTheme } from "@/feature/appearance/user-interface/theme";
import { ContentPane } from "./content-pane";
import { SecondarySidebarHost, SecondarySidebarHostProvider } from "./secondary-sidebar-host";
import { StatusBar } from "./status-bar";

export function AppShell() {
  const { data: preferences } = useSuspenseQuery(userInterfacePreferencesQuery);
  const Sidebar = useMatches({
    select: (matches) =>
      matches.findLast(({ staticData }) => staticData.primarySidebar)?.staticData.primarySidebar,
  });
  useApplyUiTheme(preferences.theme);
  useApplyUiFont(preferences.font);

  if (!Sidebar) {
    throw new Error("The matched route tree does not define a primary sidebar.");
  }

  return (
    <MotionProvider mode={motionPreferences[preferences.motion].mode}>
      <SecondarySidebarHostProvider>
        <div {...stylex.props(styles.root)}>
          <Sidebar />
          <div {...stylex.props(styles.workspace)}>
            <ContentPane.Root>
              <Outlet />
            </ContentPane.Root>
            <SecondarySidebarHost />
          </div>
          <StatusBar />
        </div>
      </SecondarySidebarHostProvider>
    </MotionProvider>
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundCanvas,
    color: colors.foregroundPrimary,
    display: "grid",
    fontSize: tokens.fontSizeSmall,
    gridTemplateColumns: "14rem minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr) 2.25rem",
    height: "100dvh",
    lineHeight: tokens.lineHeightSmall,
    minHeight: 0,
    overflow: "hidden",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gridTemplateRows: "minmax(0, 1fr)",
    marginRight: "0.5rem",
    marginTop: "0.5rem",
    minHeight: 0,
    minWidth: 0,
  },
});
