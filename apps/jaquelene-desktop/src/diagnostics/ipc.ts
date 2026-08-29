import { parseErrorReport } from "@jaquelene/diagnostics";
import { Diagnostics as DiagnosticsIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { ApplicationDiagnostics } from "./diagnostics";

export function exposeDiagnostics(target: WebFrameMain, diagnostics: ApplicationDiagnostics) {
  DiagnosticsIpc.for(target).setImplementation({
    report(payload) {
      diagnostics.recordRendererReport(parseErrorReport(payload));
    },
    async openDirectory() {
      await diagnostics.openDirectory();
    },
  });
}
