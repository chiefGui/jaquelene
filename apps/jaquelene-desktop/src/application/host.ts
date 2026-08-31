import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Cause, Exit } from "effect";
import type { App } from "electron";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import type { DesktopApplication } from "./desktop-application";

type HostState = "starting" | "running" | "stopping" | "quit-allowed" | "stopped";

export type DesktopHostInspection = Readonly<{
  state: HostState;
  showPending: boolean;
  application?: ReturnType<DesktopApplication["inspect"]>;
}>;

export type DesktopHost = Readonly<{
  inspect: () => DesktopHostInspection;
  quit: () => void;
}>;

function exitError(cause: Cause.Cause<Error>, message: string) {
  const errors = Cause.prettyErrors(cause);

  return errors.length === 1 ? errors[0]! : new AggregateError(errors, message);
}

export function createDesktopHost({
  application,
  diagnostics,
  launch,
  platform = process.platform,
  shutdownTimeout = 15_000,
}: {
  application: App;
  diagnostics: ApplicationDiagnostics;
  launch: () => DesktopApplication;
  platform?: NodeJS.Platform;
  shutdownTimeout?: number;
}): DesktopHost {
  let state: HostState = "starting";
  let desktop: DesktopApplication | undefined;
  let hostFailure:
    | Readonly<{ operation: "application.start" | "application.run"; error: unknown }>
    | undefined;
  let unexpectedExitPhase: "starting" | "running" | undefined;
  let showPending = false;
  let showOperation: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let quitAllowed = false;
  let leaseHeld = true;
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;

  function report(operation: string, error: unknown) {
    try {
      diagnostics.report({ severity: ErrorSeverity.Fatal, operation, error });
    } catch (reportFailure) {
      console.error(`Could not report fatal operation "${operation}".`, reportFailure, error);
    }
  }

  function releaseLease() {
    if (!leaseHeld) {
      return;
    }

    leaseHeld = false;

    try {
      application.releaseSingleInstanceLock();
    } catch (error) {
      console.error("Could not release the primary application instance lease.", error);
    }
  }

  function removeOperationalListeners() {
    application.off("activate", onActivate);
    application.off("second-instance", onSecondInstance);
    application.off("window-all-closed", onWindowAllClosed);
  }

  function allowFinalQuit() {
    if (quitAllowed) {
      return;
    }

    removeOperationalListeners();
    application.off("will-quit", onWillQuit);
    quitAllowed = true;
    state = "quit-allowed";
    application.quit();
  }

  function startWatchdog() {
    shutdownTimer ??= setTimeout(() => {
      console.error(`Application shutdown exceeded ${shutdownTimeout}ms; forcing final quit.`);
      allowFinalQuit();
    }, shutdownTimeout);
  }

  function reportApplicationResult(exit: Exit.Exit<void, Error>) {
    if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) {
      return;
    }

    report(
      unexpectedExitPhase === "starting"
        ? "application.start"
        : unexpectedExitPhase === "running"
          ? "application.run"
          : "application.close",
      exitError(exit.cause, "Multiple application resources failed."),
    );
  }

  function finishShutdown() {
    if (!shutdownPromise) {
      const previousState = state;
      state = "stopping";
      startWatchdog();
      shutdownPromise = (async () => {
        if (hostFailure) {
          report(hostFailure.operation, hostFailure.error);
        } else if (desktop) {
          reportApplicationResult(await desktop.stop());
        } else if (previousState === "starting") {
          report("application.start", new Error("Desktop application did not launch."));
        }

        try {
          await diagnostics[Symbol.asyncDispose]();
        } catch (error) {
          console.error("Could not close application diagnostics.", error);
        }
      })()
        .catch((error: unknown) => {
          console.error("Application shutdown failed outside its owned resource graph.", error);
        })
        .finally(allowFinalQuit);
    }

    return shutdownPromise;
  }

  function onWillQuit(event: Electron.Event) {
    if (quitAllowed) {
      return;
    }

    event.preventDefault();
    void finishShutdown();
  }

  function onQuit() {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = undefined;
    }

    releaseLease();
    process.off("exit", onProcessExit);
    state = "stopped";
  }

  function onProcessExit() {
    releaseLease();
  }

  function superviseShow() {
    if (state !== "running" || !desktop || showOperation || !showPending) {
      return;
    }

    showPending = false;
    showOperation = desktop
      .show()
      .catch((error: unknown) => {
        report("window.show", error);
        application.quit();
      })
      .finally(() => {
        showOperation = undefined;
        superviseShow();
      });
  }

  function requestShow() {
    if (state === "stopping" || state === "quit-allowed" || state === "stopped") {
      return;
    }

    showPending = true;
    superviseShow();
  }

  function onActivate() {
    requestShow();
  }

  function onSecondInstance() {
    requestShow();
  }

  function onWindowAllClosed() {
    if (platform !== "darwin") {
      application.quit();
    }
  }

  application.on("activate", onActivate);
  application.on("second-instance", onSecondInstance);
  application.on("window-all-closed", onWindowAllClosed);
  application.on("will-quit", onWillQuit);
  application.once("quit", onQuit);
  process.once("exit", onProcessExit);

  try {
    desktop = launch();
    void desktop.ready.then(
      () => {
        if (state !== "starting") {
          return;
        }

        state = "running";
        superviseShow();
      },
      () => undefined,
    );
    void desktop.result.then((exit) => {
      if (state !== "starting" && state !== "running") {
        return;
      }

      unexpectedExitPhase = state;

      if (Exit.isSuccess(exit)) {
        hostFailure = {
          operation: state === "starting" ? "application.start" : "application.run",
          error: new Error("Desktop application stopped unexpectedly."),
        };
      }

      void finishShutdown();
    });
  } catch (error) {
    hostFailure = { operation: "application.start", error };
    void finishShutdown();
  }

  return {
    inspect: () => ({
      state,
      showPending,
      ...(desktop ? { application: desktop.inspect() } : {}),
    }),
    quit: () => application.quit(),
  };
}
