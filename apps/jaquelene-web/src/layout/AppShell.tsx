import { ContentPane } from "./ContentPane";
import { PrimarySidebar } from "./PrimarySidebar";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  return (
    <div className="grid h-dvh min-h-0 grid-cols-[15rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_2.25rem] overflow-hidden bg-canvas text-foreground">
      <PrimarySidebar />
      <ContentPane />
      <StatusBar />
    </div>
  );
}
