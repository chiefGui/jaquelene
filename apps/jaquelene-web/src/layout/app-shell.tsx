import { ContentPane } from "./content-pane";
import { PrimarySidebar } from "./primary-sidebar";
import { StatusBar } from "./status-bar";

export function AppShell() {
  return (
    <div className="grid h-dvh min-h-0 grid-cols-[15rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_2.25rem] overflow-hidden bg-canvas text-foreground">
      <PrimarySidebar />
      <ContentPane />
      <StatusBar />
    </div>
  );
}
