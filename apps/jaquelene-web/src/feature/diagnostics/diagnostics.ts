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
  const onError = (event: ErrorEvent) => {
    reportError("renderer.unhandled-error", event.error ?? new Error(event.message));
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportError("renderer.unhandled-rejection", event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  let installed = true;

  return () => {
    if (!installed) {
      return;
    }

    installed = false;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
