import { parseErrorReport } from "@jaquelene/diagnostics";
import {
  Diagnostics as DiagnosticsIpc,
  DiagnosticsPreferences as DiagnosticsPreferencesIpc,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { ApplicationDiagnostics } from "./diagnostics";
import type { DiagnosticsPreferences } from "./preferences";

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

export function exposeDiagnosticsPreferences(
  target: WebFrameMain,
  preferences: DiagnosticsPreferences,
) {
  DiagnosticsPreferencesIpc.for(target).setImplementation({
    get: preferences.get,
    setWriteToDisk: preferences.setWriteToDisk,
  });
}
