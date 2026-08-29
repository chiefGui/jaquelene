import {
  createErrorReport,
  ErrorSeverity,
  ErrorSource,
  serializeErrorReport,
  type ErrorSeverity as ErrorSeverityValue,
} from "@jaquelene/diagnostics";
import { Diagnostics } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

const sendReport = requireIpcMethod(Diagnostics?.report);
export const openDiagnosticsDirectory = requireIpcMethod(Diagnostics?.openDirectory);

function reportToConsole(operation: string, error: unknown, failure: unknown) {
  console.error(`Could not record renderer failure "${operation}".`, failure, error);
}

export function reportError(
  operation: string,
  error: unknown,
  severity: ErrorSeverityValue = ErrorSeverity.Error,
) {
  try {
    const payload = serializeErrorReport(
      createErrorReport(
        { source: ErrorSource.Renderer, severity, operation, error },
        { id: crypto.randomUUID(), occurredAt: Date.now() },
      ),
    );

    void sendReport(payload).catch((failure: unknown) => {
      reportToConsole(operation, error, failure);
    });
  } catch (failure) {
    reportToConsole(operation, error, failure);
  }
}

export function installUnhandledErrorReporting() {
  window.addEventListener("error", (event) => {
    reportError("renderer.unhandled-error", event.error ?? new Error(event.message));
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError("renderer.unhandled-rejection", event.reason);
  });
}
