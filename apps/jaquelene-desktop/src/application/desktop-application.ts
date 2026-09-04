import { Cause, Effect, Exit, ManagedRuntime } from "effect";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import type { Preferences } from "../preferences/preferences";
import { createDesktopApplicationLayer } from "./layer";
import { MainWindowService, type MainWindowInspection } from "./main-window";

export type DesktopApplicationInspection = Readonly<{
  state: "starting" | "running" | "stopping" | "stopped";
  window?: MainWindowInspection;
}>;

export type DesktopApplication = Readonly<{
  ready: Promise<void>;
  result: Promise<Exit.Exit<void, Error>>;
  show: () => Promise<void>;
  inspect: () => DesktopApplicationInspection;
  stop: () => Promise<Exit.Exit<void, Error>>;
}>;

function asError(error: unknown, message: string) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(message, { cause: error });
}

function errorFromCause(cause: Cause.Cause<Error>, message: string) {
  const errors = Cause.prettyErrors(cause);

  if (errors.length === 1) {
    return errors[0]!;
  }

  return new AggregateError(errors, message);
}

export function launchDesktopApplication({
  diagnostics,
  preferences,
  userDataDirectory,
  developmentServerUrl,
}: {
  diagnostics: ApplicationDiagnostics;
  preferences: Preferences;
  userDataDirectory: string;
  developmentServerUrl: string | undefined;
}): DesktopApplication {
  const ready = Promise.withResolvers<void>();
  let readySettled = false;
  let state: DesktopApplicationInspection["state"] = "starting";
  let mainWindowInspection: (() => MainWindowInspection) | undefined;
  let showMainWindow: (() => Promise<void>) | undefined;
  const applicationAbortController = new AbortController();
  const applicationLayer = createDesktopApplicationLayer({
    configuration: { userDataDirectory, developmentServerUrl },
    diagnostics,
    preferences,
  });
  const runtime = ManagedRuntime.make(applicationLayer);

  const applicationProgram = Effect.gen(function* () {
    const mainWindow = yield* MainWindowService;
    mainWindowInspection = mainWindow.inspect;
    showMainWindow = () => runtime.runPromise(mainWindow.show);
    yield* mainWindow.show;

    state = "running";
    readySettled = true;
    ready.resolve();
    yield* Effect.never;
  });
  const executionResult = runtime.runPromiseExit(applicationProgram, {
    signal: applicationAbortController.signal,
  });
  const result = executionResult.then(async (exit): Promise<Exit.Exit<void, Error>> => {
    try {
      await runtime.dispose();
      return exit;
    } catch (error) {
      const disposalError = asError(error, "Could not dispose the desktop application runtime.");

      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
        return Exit.fail(
          new AggregateError(
            [...Cause.prettyErrors(exit.cause), disposalError],
            "Desktop application execution and cleanup failed.",
          ),
        );
      }

      return Exit.fail(disposalError);
    }
  });
  let stopPromise: Promise<Exit.Exit<void, Error>> | undefined;

  void result.then((exit) => {
    state = "stopped";

    if (!readySettled) {
      readySettled = true;
      let error = new Error("Desktop application stopped before becoming ready.");

      if (Exit.isFailure(exit)) {
        error = errorFromCause(exit.cause, "Desktop application startup failed.");
      }

      ready.reject(error);
    }
  });

  function stop() {
    if (!stopPromise) {
      if (state === "stopped") {
        stopPromise = result;
        return stopPromise;
      }

      state = "stopping";
      applicationAbortController.abort();
      stopPromise = result;
    }

    return stopPromise;
  }

  return {
    ready: ready.promise,
    result,
    show: async () => {
      await ready.promise;

      if (!showMainWindow || state !== "running") {
        throw new Error("Desktop application is not running.");
      }
      await showMainWindow();
    },
    inspect: () => {
      if (mainWindowInspection) {
        return { state, window: mainWindowInspection() };
      }

      return { state };
    },
    stop,
  };
}
